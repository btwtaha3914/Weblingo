# LibreTranslate Deployment Package
# ================================
# This package contains everything needed to run LibreTranslate on your server.

## Libraries to Install (Python 3.11+)

### System Requirements
- Python 3.11 or higher
- pip (Python package manager)
- 2GB+ RAM (for 6 language pairs)
- 1GB+ disk space (for language models)

### Python Libraries (install via pip)
```
libretranslate==1.9.6
argostranslate==1.9.6
ctranslate2>=4.0
sentencepiece>=0.2.0
sacremoses>=0.0.53
flask==2.2.5
flask-babel==3.1.0
flask-limiter==2.6.3
flask-swagger==0.2.14
flask-swagger-ui==4.11.1
requests==2.31.0
numpy>=1.24
packaging==23.1
polib==1.1.1
prometheus-client==0.15.0
waitress==2.1.2
werkzeug==2.3.8
itsdangerous==2.1.2
langdetect==1.0.9
lexilang==1.0.7
minisbd==0.9.5
apscheduler==3.11.2
tzlocal>=3.0
expiringdict==1.2.2
redis==4.4.4
argos-translate-files==1.4.4
argos-translate-lt==1.12.1
```

### Quick Install (Linux/macOS)
```bash
# 1. Install Python 3.11+
sudo apt update && sudo apt install -y python3 python3-pip python3-venv

# 2. Create virtual environment
python3 -m venv /opt/libretranslate-venv
source /opt/libretranslate-venv/bin/activate

# 3. Install LibreTranslate (pin Flask version for compatibility)
pip install libretranslate
pip install flask==2.2.5 werkzeug==2.3.8 itsdangerous==2.1.2

# 4. Download language models
python3 -c "
import argostranslate.package
argostranslate.package.update_package_index()
available = argostranslate.package.get_available_packages()
for p in available:
    if p.from_code == 'en' and p.to_code in ('es','fr','de','ar','ur'):
        print('Installing', p.from_code, '->', p.to_code)
        argostranslate.package.install_from_path(p.download())
print('Done')
"

# 5. Start LibreTranslate
libretranslate --host 0.0.0.0 --port 5000
```

### Quick Install (Windows)
```powershell
# 1. Install Python 3.11+ from https://python.org
# 2. Open PowerShell as Administrator
python -m venv C:\libretranslate-venv
C:\libretranslate-venv\Scripts\activate
pip install libretranslate

# 3. Download language models
python -c "
import argostranslate.package
argostranslate.package.update_package_index()
available = argostranslate.package.get_available_packages()
for p in available:
    if p.from_code == 'en' and p.to_code in ('es','fr','de','ar','ur'):
        print('Installing', p.from_code, '->', p.to_code)
        argostranslate.package.install_from_path(p.download())
print('Done')
"

# 4. Start LibreTranslate
libretranslate --host 0.0.0.0 --port 5000
```

### Quick Install (Docker)
```bash
# 1. Install Docker
# https://docs.docker.com/get-docker/

# 2. Run LibreTranslate
docker run -d \
  --name libretranslate \
  -p 5000:5000 \
  -e LT_LOAD_ONLY=en,es,fr,de,ar,ur \
  -v libretranslate_models:/home/libretranslate/.local/share \
  libretranslate/libretranslate:latest

# 3. Verify
curl http://localhost:5000/languages
```

### Running as a Service (Linux systemd)
Create /etc/systemd/system/libretranslate.service:
```
[Unit]
Description=LibreTranslate Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/libretranslate
Environment="LT_LOAD_ONLY=en,es,fr,de,ar,ur"
ExecStart=/opt/libretranslate-venv/bin/libretranslate --host 0.0.0.0 --port 5000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable libretranslate
sudo systemctl start libretranslate
```

### API Endpoints
- GET  /languages    → List supported languages
- POST /translate    → Translate text
  Body: {"q": "text", "source": "en", "target": "es", "format": "text"}
  Response: {"translatedText": "translated text"}

### Language Pairs Included
- English → Spanish (es)
- English → French (fr)
- English → German (de)
- English → Arabic (ar) — RTL
- English → Urdu (ur) — RTL

### To Add More Languages
Change LT_LOAD_ONLY to include more codes:
```
LT_LOAD_ONLY=en,es,fr,de,ar,ur,it,pt,ru,zh,ja,ko,hi,tr,nl,pl
```
Note: More languages = more RAM needed. 512MB fits ~4-5 pairs, 2GB fits ~10 pairs.

### Connecting to WebLingo
Set this environment variable in your WebLingo deployment:
```
LIBRETRANSLATE_URL=http://your-server-ip:5000
```

WebLingo will automatically use LibreTranslate for translations instead of MyMemory.

### Troubleshooting
| Issue | Fix |
|-------|-----|
| "Out of memory" | Reduce LT_LOAD_ONLY to fewer languages |
| "Port already in use" | Change --port to 5001 or another port |
| "Module not found" | Run: pip install libretranslate |
| Slow first request | Models loading (30-60s), subsequent requests are fast |
| "No open ports detected" | Set port explicitly: --port 5000 |