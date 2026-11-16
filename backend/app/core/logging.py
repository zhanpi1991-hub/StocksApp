import json
import logging
import re

# Some providers (Twelve Data, FMP) only accept the key as a URL query parameter, so any logged URL could carry it.
_SECRET = re.compile(r"(?i)((?:api[_-]?key|apikey|x[_-]cg-(?:demo|pro)-api-key|token|authorization)[\"']?\s*[=:]\s*[\"']?)([^&\s\"',}]+)")


def redact(text: str) -> str:
    return _SECRET.sub(r"\1***", text)


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = None
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {"ts": self.formatTime(record), "level": record.levelname, "logger": record.name, "msg": redact(record.getMessage())}
        if record.exc_info:
            data["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(data)


def setup_logging() -> None:
    h = logging.StreamHandler()
    h.setFormatter(JsonFormatter())
    h.addFilter(RedactFilter())
    root = logging.getLogger()
    root.handlers = [h]
    root.setLevel(logging.INFO)
    # httpx logs every request URL at INFO, which would include ?apikey=... for query-param providers.
    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
