from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from database.connection import get_db
from database.schema import Alert, Station, AQIRecord, User
from auth.auth_handler import get_current_user

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    station_id: int
    parameter: str          # 'aqi', 'pm25', 'pm10', 'no2', 'so2'
    threshold: float


class AlertResponse(BaseModel):
    id: int
    user_id: Optional[int]
    station_id: Optional[int]
    station_name: Optional[str]
    parameter: str
    threshold: float
    current_value: Optional[float]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Helper: check a freshly inserted AQI record against stored alert thresholds ─

def check_alerts_for_record(db: Session, record: AQIRecord):
    """
    Called after every new AQIRecord is persisted.
    Checks every active alert for the same station and parameter.
    If the threshold is exceeded, sets status → 'triggered' and stores current_value.
    """
    if record.station_id is None:
        return

    active_alerts = (
        db.query(Alert)
        .filter(
            Alert.station_id == record.station_id,
            Alert.status == "active",
        )
        .all()
    )

    param_map = {
        "aqi":  record.aqi,
        "pm25": record.pm25,
        "pm10": record.pm10,
        "no2":  record.no2,
        "so2":  record.so2,
    }

    for alert in active_alerts:
        value = param_map.get(alert.parameter.lower())
        if value is not None and value >= alert.threshold:
            alert.status = "triggered"
            alert.current_value = value

    db.commit()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(
    data: AlertCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Create a new alert threshold for a station parameter."""
    # Verify station exists
    station = db.query(Station).filter(Station.id == data.station_id).first()
    if not station:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Station {data.station_id} not found",
        )

    valid_params = {"aqi", "pm25", "pm10", "no2", "so2"}
    if data.parameter.lower() not in valid_params:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Parameter must be one of: {', '.join(valid_params)}",
        )

    # Check latest record to set current_value immediately
    latest = (
        db.query(AQIRecord)
        .filter(AQIRecord.station_id == data.station_id)
        .order_by(AQIRecord.timestamp.desc())
        .first()
    )
    param_map = {
        "aqi": latest.aqi if latest else None,
        "pm25": latest.pm25 if latest else None,
        "pm10": latest.pm10 if latest else None,
        "no2": latest.no2 if latest else None,
        "so2": latest.so2 if latest else None,
    }
    current_val = param_map.get(data.parameter.lower())

    # Determine initial status
    initial_status = "active"
    if current_val is not None and current_val >= data.threshold:
        initial_status = "triggered"

    new_alert = Alert(
        user_id=current_user.id if current_user else None,
        station_id=data.station_id,
        parameter=data.parameter.lower(),
        threshold=data.threshold,
        current_value=current_val,
        status=initial_status,
    )
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)

    return AlertResponse(
        id=new_alert.id,
        user_id=new_alert.user_id,
        station_id=new_alert.station_id,
        station_name=station.name,
        parameter=new_alert.parameter,
        threshold=new_alert.threshold,
        current_value=new_alert.current_value,
        status=new_alert.status,
        created_at=new_alert.created_at,
    )


@router.get("", response_model=List[AlertResponse])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """
    Return all alerts belonging to the authenticated user.
    Falls back to all alerts when running with mock/dev token (no real user).
    """
    query = db.query(Alert)
    if current_user:
        query = query.filter(Alert.user_id == current_user.id)
    alerts = query.order_by(Alert.created_at.desc()).all()

    result = []
    for a in alerts:
        station_name = a.station.name if a.station else None
        result.append(
            AlertResponse(
                id=a.id,
                user_id=a.user_id,
                station_id=a.station_id,
                station_name=station_name,
                parameter=a.parameter,
                threshold=a.threshold,
                current_value=a.current_value,
                status=a.status,
                created_at=a.created_at,
            )
        )
    return result


@router.patch("/{alert_id}/dismiss", response_model=AlertResponse)
def dismiss_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Dismiss a triggered or active alert (set status → 'dismissed')."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "dismissed"
    db.commit()
    db.refresh(alert)

    station_name = alert.station.name if alert.station else None
    return AlertResponse(
        id=alert.id,
        user_id=alert.user_id,
        station_id=alert.station_id,
        station_name=station_name,
        parameter=alert.parameter,
        threshold=alert.threshold,
        current_value=alert.current_value,
        status=alert.status,
        created_at=alert.created_at,
    )


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Permanently remove an alert."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    db.delete(alert)
    db.commit()
