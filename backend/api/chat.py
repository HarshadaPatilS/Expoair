from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

from database.connection import get_db
from database.schema import ChatHistory, AQIRecord, Prediction, User, Station
from auth.auth_handler import get_current_user

router = APIRouter(prefix="/chat", tags=["AI Assistant"])


class ChatMessageRequest(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    answer: str
    timestamp: datetime


def _get_live_context(db: Session) -> dict:
    """Pull real numbers from DB to ground chatbot answers."""
    ctx = {
        "current_aqi": None,
        "current_station": None,
        "current_pm25": None,
        "forecast_aqi": None,
        "db_record_count": 0,
        "peak_aqi_24h": None,
        "mean_aqi_24h": None,
    }
    try:
        # Latest AQI record
        latest = db.query(AQIRecord).order_by(AQIRecord.timestamp.desc()).first()
        if latest:
            ctx["current_aqi"] = round(latest.aqi, 1)
            ctx["current_pm25"] = round(latest.pm25, 1)
            # Station name
            if latest.station_id:
                s = db.query(Station).filter(Station.id == latest.station_id).first()
                if s:
                    ctx["current_station"] = s.name

        # 24-h stats
        cutoff = datetime.utcnow() - timedelta(hours=24)
        recent = db.query(AQIRecord).filter(AQIRecord.timestamp >= cutoff).all()
        ctx["db_record_count"] = len(recent)
        if recent:
            aqis = [r.aqi for r in recent]
            ctx["mean_aqi_24h"] = round(sum(aqis) / len(aqis), 1)
            ctx["peak_aqi_24h"] = round(max(aqis), 1)

        # Latest forecast
        pred = db.query(Prediction).order_by(Prediction.timestamp.desc()).first()
        if pred:
            ctx["forecast_aqi"] = round(pred.predicted_aqi, 1)

    except Exception:
        pass
    return ctx


def _aqi_label(aqi: Optional[float]) -> str:
    if aqi is None:
        return "unknown"
    if aqi <= 50:   return "Good"
    if aqi <= 100:  return "Moderate"
    if aqi <= 200:  return "Unhealthy"
    if aqi <= 300:  return "Very Unhealthy"
    return "Hazardous"


def _safe_hours(aqi: Optional[float]) -> str:
    if aqi is None or aqi <= 50:
        return "anytime — air quality is good"
    if aqi <= 100:
        return "early morning (5–7 AM) or late evening (7–9 PM) when traffic is low"
    if aqi <= 200:
        return "12 PM–3 PM (solar heating disperses ground-level PM2.5)"
    return "indoors only — AQI is currently in the hazardous range"


@router.post("", response_model=ChatMessageResponse)
def post_chat_message(
    request: ChatMessageRequest = Body(...),
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = request.message.lower().strip()
    ctx = _get_live_context(db)

    aqi     = ctx["current_aqi"]
    pm25    = ctx["current_pm25"]
    station = ctx["current_station"] or "nearest station"
    fcst    = ctx["forecast_aqi"]
    peak    = ctx["peak_aqi_24h"]
    mean24  = ctx["mean_aqi_24h"]
    label   = _aqi_label(aqi)

    # ── Intent matching ───────────────────────────────────────────────────

    if any(k in msg for k in ("current aqi", "what is aqi", "aqi now", "how is air", "pollution now")):
        if aqi:
            answer = (
                f"The current AQI at **{station}** is **{aqi}** ({label}). "
                f"PM2.5 concentration is {pm25} µg/m³. "
                + (f"Over the last 24 hours the mean AQI was {mean24} with a peak of {peak}." if mean24 else "")
            )
        else:
            answer = "I'm unable to retrieve live AQI right now. Please check that the backend is seeded and running."

    elif any(k in msg for k in ("why", "rising", "cause", "reason", "pollution high", "bad air")):
        causes = []
        if aqi and aqi > 100:
            causes.append("elevated vehicular emissions during peak commute hours")
        if aqi and aqi > 150:
            causes.append("low wind speeds (<6 km/h) causing atmospheric stagnation")
        if peak and mean24 and peak > mean24 * 1.3:
            causes.append(f"a spike event that pushed AQI to {peak} in the last 24 h")
        if not causes:
            causes = ["mixed urban and biogenic sources"]
        answer = (
            f"Current AQI is {aqi} ({label}) at {station}. "
            f"Contributing factors: {'; '.join(causes)}. "
            "The SHAP panel on the Forecast page shows the exact feature contributions from the ML model."
        )

    elif any(k in msg for k in ("tomorrow", "forecast", "predict", "next day", "better")):
        if fcst:
            f_label = _aqi_label(fcst)
            trend = "improve" if (aqi and fcst < aqi) else "remain similar or worsen"
            answer = (
                f"Tomorrow's LSTM forecast predicts an AQI of **{fcst}** ({f_label}). "
                f"Conditions are expected to **{trend}** compared to today's {aqi}. "
                "Check the XAI Forecasting page for the full 24-hour predictive timeline."
            )
        else:
            answer = (
                "No forecast is stored yet. Please open the Forecasting page to generate a prediction "
                "for your current location."
            )

    elif any(k in msg for k in ("exercise", "jog", "run", "walk", "outdoor", "safe", "safe to go out")):
        answer = (
            f"With the current AQI of {aqi} ({label}) at {station}, the safest time for outdoor activity is: "
            f"{_safe_hours(aqi)}. "
            + ("Consider wearing an N95 mask if exercising outdoors." if aqi and aqi > 100 else
               "Air quality is currently acceptable for most outdoor activities.")
        )

    elif any(k in msg for k in ("shap", "explain", "feature", "why model", "how model")):
        answer = (
            "SHAP (SHapley Additive exPlanations) decomposes the model's AQI prediction into per-feature contributions. "
            f"For the last prediction of {fcst or aqi} AQI: PM2.5 is typically the largest driver, "
            "followed by wind speed (negative — more wind = lower AQI) and traffic congestion index. "
            "The Interactive SHAP Simulator on the Forecasting page lets you adjust sliders to see how "
            "each parameter shifts the prediction in real time."
        )

    elif any(k in msg for k in ("route", "commute", "path", "travel", "healthiest")):
        answer = (
            "Use the Route Planner page to compare four commute alternatives: Shortest, Fastest, "
            "Lowest Pollution, and Balanced. Each route samples AQI from monitoring stations along the path. "
            f"With current AQI at {aqi}, the lowest-pollution route will route you through green or residential "
            "areas to minimize PM2.5 inhalation. The Transit Exposure Score = travel time × (AQI/100)."
        )

    elif any(k in msg for k in ("station", "location", "city", "delhi", "pune", "pcmc", "lonavala")):
        answer = (
            "AirSense AI monitors stations across Delhi (Anand Vihar, ITO, Rohini, Dwarka), "
            "Pune (Central Hub, Katraj MPCB, Hinjewadi), PCMC (Pimpri-Chinchwad, Bhosari MIDC), "
            "and Lonavala (Sinhgad Institute IoT). "
            "Delhi typically shows AQI 100–250+, while Lonavala remains clean at 25–50. "
            "Switch stations in the Dashboard dropdown to compare."
        )

    elif any(k in msg for k in ("week", "7 day", "weekly", "compare", "trend")):
        if mean24:
            answer = (
                f"Over the last 24 hours, mean AQI across all stations was {mean24} "
                f"with a peak of {peak}. "
                "The Analytics page shows the full 7–14 day trend chart, scatter correlation "
                "matrix (wind speed vs PM2.5), and raw telemetry records from the database."
            )
        else:
            answer = "Weekly trend data is not yet available. Seed the database and let the system collect readings."

    elif any(k in msg for k in ("mask", "health", "risk", "advice", "precaution")):
        if aqi and aqi > 200:
            advice = "Everyone should avoid outdoor activities. Use N95/FFP2 masks indoors near open windows."
        elif aqi and aqi > 100:
            advice = "Sensitive groups (children, elderly, asthmatics) should limit outdoor exposure. Others may use surgical masks."
        else:
            advice = "Air quality is acceptable. No special precautions needed for healthy adults."
        answer = f"With AQI {aqi} ({label}): {advice} The Health Assessment page provides personalized risk scoring."

    else:
        answer = (
            f"Hello! I'm AirSense AI. The current AQI is **{aqi} ({label})** at {station}. "
            "I can answer questions about: \n"
            "• **Current & forecast AQI** — try 'What is AQI now?' or 'Will tomorrow be better?'\n"
            "• **Health & safety** — 'Is it safe to jog?' or 'Should I wear a mask?'\n"
            "• **Model explanations** — 'Explain SHAP' or 'Why did the model predict high AQI?'\n"
            "• **Routes** — 'What is the healthiest commute route?'\n"
            "• **Station data** — 'How is Delhi air quality?'"
        )

    # Persist chat history
    db.add(ChatHistory(
        user_id=current_user.id if current_user else None,
        question=request.message,
        answer=answer,
    ))
    db.commit()

    return ChatMessageResponse(answer=answer, timestamp=datetime.utcnow())
