"""Regular-hours trading session schedule per exchange.

This is a static weekday schedule computed locally from published regular trading hours.
It does NOT know exchange holidays or half days; the UI labels it 'scheduled'."""
from datetime import datetime, time
from zoneinfo import ZoneInfo

EXCHANGES = {
    "US": ("New York (NYSE/Nasdaq)", "America/New_York", [(time(9, 30), time(16, 0))]),
    "UK": ("London (LSE)", "Europe/London", [(time(8, 0), time(16, 30))]),
    "DE": ("Frankfurt (Xetra)", "Europe/Berlin", [(time(9, 0), time(17, 30))]),
    "JP": ("Tokyo (TSE)", "Asia/Tokyo", [(time(9, 0), time(11, 30)), (time(12, 30), time(15, 30))]),
    "HK": ("Hong Kong (HKEX)", "Asia/Hong_Kong", [(time(9, 30), time(12, 0)), (time(13, 0), time(16, 0))]),
    "KR": ("Seoul (KRX)", "Asia/Seoul", [(time(9, 0), time(15, 30))]),
    "RU": ("Moscow (MOEX)", "Europe/Moscow", [(time(9, 50), time(18, 50))]),
    "KZ": ("Almaty (KASE)", "Asia/Almaty", [(time(11, 0), time(17, 0))]),
}


def session_status(code: str, now: datetime | None = None) -> dict:
    name, tz, windows = EXCHANGES[code]
    local = (now or datetime.now(ZoneInfo("UTC"))).astimezone(ZoneInfo(tz))
    open_ = local.weekday() < 5 and any(a <= local.time() < b for a, b in windows)
    return {
        "exchange": code, "name": name, "timezone": tz, "local_time": local.isoformat(timespec="minutes"),
        "status": "open" if open_ else "closed", "basis": "scheduled",
        "note": "Computed from regular trading hours; exchange holidays and early closes are not reflected.",
    }


def all_sessions() -> list[dict]:
    return [session_status(c) for c in EXCHANGES]
