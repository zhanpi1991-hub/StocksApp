from app.providers.coingecko import CoinGecko
from app.providers.finnhub import Finnhub
from app.providers.fmp import FMP
from app.providers.frankfurter import Frankfurter
from app.providers.twelve_data import TwelveData

finnhub = Finnhub()
twelve = TwelveData()
fmp = FMP()
coingecko = CoinGecko()
frankfurter = Frankfurter()

ALL = [finnhub, twelve, fmp, coingecko, frankfurter]


def health() -> list[dict]:
    return [p.health() for p in ALL]
