from app.core.config import get_settings
from app.providers.base import Out, Provider, num

DELAY_MSG = "CoinGecko aggregated prices, cached on this server for a short time. Not tick-level real time."


class CoinGecko(Provider):
    name = "coingecko"
    key_env = "COINGECKO_API_KEY (optional Demo key)"
    base_url = "https://api.coingecko.com/api/v3"
    default_cooldown = 60.0  # CoinGecko limits are per-minute windows; 429s may carry no Retry-After

    def budget_per_minute(self) -> int:
        s = get_settings()
        return s.coingecko_requests_per_minute or (25 if self.api_key() else 10)

    @property
    def requires_key(self) -> bool:
        return False

    def api_key(self) -> str:
        return get_settings().coingecko_api_key

    def auth(self, params, headers):
        # Demo plan: api.coingecko.com + x-cg-demo-api-key header (per CoinGecko's Demo authentication docs).
        # A Pro key would need pro-api.coingecko.com and x-cg-pro-api-key instead - not supported here.
        if self.api_key():
            headers["x-cg-demo-api-key"] = self.api_key()

    def detect_error(self, data):
        if isinstance(data, dict) and isinstance(data.get("status"), dict) and data["status"].get("error_code"):
            return (f"coingecko: {data['status'].get('error_message', 'error')}", False)
        return None

    @staticmethod
    def _coin(c: dict) -> dict:
        return {
            "id": c.get("id"), "symbol": (c.get("symbol") or "").upper(), "name": c.get("name"), "image": c.get("image"),
            "price": num(c.get("current_price")), "market_cap": num(c.get("market_cap")), "rank": c.get("market_cap_rank"),
            "volume": num(c.get("total_volume")), "high_24h": num(c.get("high_24h")), "low_24h": num(c.get("low_24h")),
            "change_1h": num(c.get("price_change_percentage_1h_in_currency")),
            "change_24h": num(c.get("price_change_percentage_24h_in_currency", c.get("price_change_percentage_24h"))),
            "change_7d": num(c.get("price_change_percentage_7d_in_currency")),
            "circulating_supply": num(c.get("circulating_supply")), "total_supply": num(c.get("total_supply")),
            "max_supply": num(c.get("max_supply")), "ath": num(c.get("ath")), "ath_change_pct": num(c.get("ath_change_percentage")),
            "sparkline": (c.get("sparkline_in_7d") or {}).get("price"),
        }

    async def markets(self, page=1, per_page=250, order="market_cap_desc", category=None, ids=None, vs="usd") -> Out:
        """One /coins/markets call (max 250 rows; `ids` is a comma-separated batch of up to 250 coin ids)."""
        f = await self.get("/coins/markets", {
            "vs_currency": vs, "order": order, "per_page": per_page, "page": page, "category": category,
            "ids": ids, "sparkline": "true", "price_change_percentage": "1h,24h,7d",
        }, ttl=get_settings().crypto_markets_ttl)
        return self.out(f, [self._coin(c) for c in f.data], "delayed", DELAY_MSG)

    async def coin(self, coin_id: str) -> Out:
        f = await self.get(f"/coins/{coin_id}", {
            "localization": "false", "tickers": "false", "community_data": "false", "developer_data": "false", "sparkline": "false",
        }, ttl=300)
        d = f.data
        md = d.get("market_data") or {}

        def cur(k):
            return num((md.get(k) or {}).get("usd"))

        data = {
            "id": d.get("id"), "symbol": (d.get("symbol") or "").upper(), "name": d.get("name"),
            "image": (d.get("image") or {}).get("large"), "rank": d.get("market_cap_rank"),
            "description": (d.get("description") or {}).get("en", ""), "categories": d.get("categories") or [],
            "homepage": ((d.get("links") or {}).get("homepage") or [None])[0], "genesis_date": d.get("genesis_date"),
            "price": cur("current_price"), "market_cap": cur("market_cap"), "volume": cur("total_volume"),
            "high_24h": cur("high_24h"), "low_24h": cur("low_24h"), "ath": cur("ath"), "atl": cur("atl"),
            "fdv": cur("fully_diluted_valuation"),
            "change_1h": num((md.get("price_change_percentage_1h_in_currency") or {}).get("usd")),
            "change_24h": num(md.get("price_change_percentage_24h")), "change_7d": num(md.get("price_change_percentage_7d")),
            "change_30d": num(md.get("price_change_percentage_30d")), "change_1y": num(md.get("price_change_percentage_1y")),
            "circulating_supply": num(md.get("circulating_supply")), "total_supply": num(md.get("total_supply")),
            "max_supply": num(md.get("max_supply")),
        }
        return self.out(f, data, "delayed", DELAY_MSG)

    async def chart(self, coin_id: str, days: str) -> Out:
        ttl = 300 if days in ("1", "7") else 1800 if days in ("30", "90") else 6 * 3600  # long ranges barely change
        f = await self.get(f"/coins/{coin_id}/market_chart", {"vs_currency": "usd", "days": days}, ttl=ttl)
        pts = [{"time": int(t // 1000), "value": v} for t, v in f.data.get("prices", [])]
        return self.out(f, pts, "historical", "CoinGecko free plans limit historical depth (about 365 days).")

    async def trending(self) -> Out:
        f = await self.get("/search/trending", ttl=900)
        items = []
        for c in f.data.get("coins", []):
            it = c["item"]
            items.append({
                "id": it["id"], "symbol": it["symbol"].upper(), "name": it["name"], "image": it.get("small"),
                "rank": it.get("market_cap_rank"),
                "change_24h": num(((it.get("data") or {}).get("price_change_percentage_24h") or {}).get("usd")),
            })
        return self.out(f, items, "delayed")

    async def global_data(self) -> Out:
        f = await self.get("/global", ttl=300)
        d = f.data.get("data", {})
        data = {
            "total_market_cap": num((d.get("total_market_cap") or {}).get("usd")),
            "total_volume": num((d.get("total_volume") or {}).get("usd")),
            "change_24h": num(d.get("market_cap_change_percentage_24h_usd")),
            "dominance": {k.upper(): v for k, v in sorted((d.get("market_cap_percentage") or {}).items(), key=lambda x: -x[1])[:8]},
            "active_coins": d.get("active_cryptocurrencies"),
        }
        return self.out(f, data, "delayed", DELAY_MSG)

    async def categories(self) -> Out:
        f = await self.get("/coins/categories/list", ttl=24 * 3600)
        return self.out(f, [{"id": c["category_id"], "name": c["name"]} for c in f.data], "delayed")

    async def search(self, q: str) -> Out:
        f = await self.get("/search", {"query": q}, ttl=120)
        coins = [{"id": c["id"], "symbol": c["symbol"].upper(), "name": c["name"], "image": c.get("thumb"), "rank": c.get("market_cap_rank")} for c in f.data.get("coins", [])[:8]]
        return self.out(f, coins, "delayed")
