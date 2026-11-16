from datetime import date, timedelta

from app.providers.base import Out, Provider

NOTE = "Daily reference rates from central banks via Frankfurter (not tick-level real time)."


class Frankfurter(Provider):
    name = "frankfurter"
    base_url = "https://api.frankfurter.dev/v2"

    @property
    def requires_key(self) -> bool:
        return False

    async def currencies(self) -> Out:
        f = await self.get("/currencies", ttl=86400)
        d = f.data
        if isinstance(d, dict):
            items = [{"code": k, "name": v if isinstance(v, str) else v.get("name", k)} for k, v in d.items()]
        else:
            items = [{"code": c.get("iso_code") or c.get("code"), "name": c.get("name")} for c in d]
        return self.out(f, sorted(items, key=lambda x: x["code"] or ""), "delayed", NOTE)

    async def latest(self, base: str, quotes: list[str]) -> Out:
        f = await self.get("/rates", {"base": base, "quotes": ",".join(quotes)}, ttl=900)
        rates = {r["quote"]: {"rate": r["rate"], "date": r["date"]} for r in f.data}
        return self.out(f, {"base": base, "rates": rates}, "delayed", NOTE)

    async def history(self, base: str, quote: str, start: date, end: date) -> Out:
        f = await self.get("/rates", {"from": start.isoformat(), "to": end.isoformat(), "base": base, "quotes": quote}, ttl=3600)
        pts = [{"time": r["date"], "value": r["rate"]} for r in f.data if r["quote"] == quote]
        return self.out(f, pts, "historical", NOTE)

    async def change(self, base: str, quote: str) -> Out:
        """Latest rate plus change vs the previous available fixing."""
        end = date.today()
        f = await self.get("/rates", {"from": (end - timedelta(days=7)).isoformat(), "to": end.isoformat(), "base": base, "quotes": quote}, ttl=900)
        pts = [r for r in f.data if r["quote"] == quote]
        if not pts:
            return Out(None, "unavailable", self.name, None, f"No rate available for {base}/{quote}.")
        last = pts[-1]
        prev = pts[-2] if len(pts) > 1 else None
        data = {
            "base": base, "quote": quote, "rate": last["rate"], "date": last["date"],
            "previous": prev["rate"] if prev else None,
            "change": (last["rate"] - prev["rate"]) if prev else None,
            "change_pct": ((last["rate"] / prev["rate"] - 1) * 100) if prev else None,
        }
        return self.out(f, data, "delayed", NOTE)
