#!/bin/bash
# LibreTranslate Setup Script for Linux
# Usage: bash setup_libretranslate.sh

set -e

echo "=== LibreTranslate Setup ==="

# 1. Check Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 not found. Installing..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

PYTHON_VERSION=$(python3 --version)
echo "Python: $PYTHON_VERSION"

# 2. Create virtual environment
VENV_DIR="/opt/libretranslate-venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    sudo python3 -m venv $VENV_DIR
fi

# 3. Activate and install
source $VENV_DIR/bin/activate
echo "Installing LibreTranslate..."
pip install --upgrade pip
pip install libretranslate

# 4. Download language models
echo "Downloading language models..."
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

# 5. Create systemd service
echo "Creating systemd service..."
sudo tee /etc/systemd/system/libretranslate.service > /dev/null <<EOF
[Unit]
Description=LibreTranslate Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/libretranslate
Environment="LT_LOAD_ONLY=en,es,fr,de,ar,ur"
ExecStart=$VENV_DIR/bin/libretranslate --host 0.0.0.0 --port 5000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable libretranslate
sudo systemctl start libretranslate

echo ""
echo "=== Setup Complete ==="
echo "LibreTranslate is running on http://127.0.0.1:5000"
echo "Test: curl http://127.0.0.1:5000/languages"
echo "Connect to WebLingo: set LIBRETRANSLATE_URL=http://YOUR_SERVER_IP:5000"