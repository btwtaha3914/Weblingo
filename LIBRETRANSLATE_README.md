# LibreTranslate Deployment Package

## What's Included
- `LIBRETRANSLATE_DEPLOY.md` — Full installation guide
- `requirements.txt` — Python dependencies
- `setup_libretranslate.sh` — Automated setup script (Linux)
- `docker-compose.yml` — Docker setup (in main project)

## Quick Start

### Option 1: Docker (Easiest)
```bash
docker run -d \
  --name libretranslate \
  -p 5000:5000 \
  -e LT_LOAD_ONLY=en,es,fr,de,ar,ur \
  -v libretranslate_models:/home/libretranslate/.local/share \
  libretranslate/libretranslate:latest
```

### Option 2: Linux Server (Automated)
```bash
chmod +x setup_libretranslate.sh
sudo bash setup_libretranslate.sh
```

### Option 3: Manual (Any OS)
```bash
pip install libretranslate
libretranslate --host 0.0.0.0 --port 5000
```

## Connect to WebLingo
Set this environment variable in WebLingo:
```
LIBRETRANSLATE_URL=http://your-server-ip:5000
```

## Libraries Required
See `requirements.txt` for the full list. Main packages:
- `libretranslate` — The translation API server
- `argostranslate` — Language model management
- `ctranslate2` — Neural inference engine
- `flask` — Web framework

## Memory Requirements
| Languages | RAM Needed |
|-----------|-----------|
| en, es | ~300MB |
| en, es, fr, de | ~600MB |
| en, es, fr, de, ar, ur | ~1GB |
| All 29 languages | ~4GB+ |

## Free Hosting Options
| Provider | RAM | Sleep? | Cost |
|----------|-----|--------|------|
| Railway.app | 2GB | No | $5 free/mo |
| Fly.io | 256MB×3 | No | Free |
| Hugging Face | 16GB | No | Free |
| Render (free) | 512MB | Yes (15min) | Free |
| Render (paid) | 2GB | No | $7/mo |

## Test
```bash
curl http://localhost:5000/languages
curl -X POST http://localhost:5000/translate -H "Content-Type: application/json" -d '{"q":"Hello","source":"en","target":"es","format":"text"}'
```