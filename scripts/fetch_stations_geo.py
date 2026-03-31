"""
One-time script: download Renfe station CSV and generate public/data/stations_geo.json.

Usage (from repo root, venv active):
    python -m scripts.fetch_stations_geo

The CSV at ssl.renfe.com has columns:
    _id, CODIGO, descripcion, latitud, longitud, direccion, cp,
    poblacion, provincia, pais, cercanias, feve, comun

Output: public/data/stations_geo.json
    {
      "<stop_id>": {"name": "Madrid-Atocha", "lat": 40.406, "lng": -3.690, "cercanias": true},
      ...
    }
"""
import csv
import io
import json
import logging
import sys
from pathlib import Path

import requests

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

CSV_URL = "https://ssl.renfe.com/ftransit/Fichero_estaciones/estaciones.csv"
OUT_PATH = Path(__file__).parent.parent / "public" / "data" / "stations_geo.json"


def fetch_and_parse() -> dict:
    log.info(f"Downloading {CSV_URL} ...")
    resp = requests.get(CSV_URL, timeout=30, verify=False)
    resp.raise_for_status()

    # Renfe CSVs are sometimes latin-1; try utf-8-sig first then fallback
    for enc in ("utf-8-sig", "latin-1"):
        try:
            text = resp.content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = resp.content.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    geo: dict = {}
    skipped = 0

    for row in reader:
        code = (row.get("CODIGO") or "").strip()
        if not code:
            skipped += 1
            continue

        try:
            lat = float((row.get("LATITUD") or "").replace(",", "."))
            lng = float((row.get("LONGITUD") or "").replace(",", "."))
        except (ValueError, AttributeError):
            skipped += 1
            continue

        # Skip stations outside Spain (lat ~35-44, lng ~-9.5 to 4.5) or clearly bogus
        if not (35.0 <= lat <= 44.5 and -10.0 <= lng <= 5.0):
            skipped += 1
            continue

        name = (row.get("DESCRIPCION") or "").strip().title()
        is_cercanias = (row.get("CERCANIAS") or "").strip().upper() == "SI"
        provincia = (row.get("PROVINCIA") or "").strip().title()
        poblacion = (row.get("POBLACION") or "").strip().title()
        direcion = (row.get("DIRECION") or "").strip().title()
        cp = (row.get("CP") or "").strip()

        geo[code] = {
            "name": name,
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "cercanias": is_cercanias,
            "provincia": provincia,
            "poblacion": poblacion,
            "direcion": direcion,
            "cp": cp,
        }

    log.info(f"Parsed {len(geo)} stations ({skipped} skipped — no coords or outside Spain)")
    return geo


def main() -> None:
    geo = fetch_and_parse()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info(f"Written → {OUT_PATH}  ({OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
