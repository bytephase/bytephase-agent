#!/bin/bash

echo "========================================="
echo "Bytephase Tally Agent - Installation"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "✅ Installation Complete!"
    echo "========================================="
    echo ""
    echo "Next steps:"
    echo "1. Start the agent:"
    echo "   npm start"
    echo ""
    echo "2. Configure via Settings UI"
    echo "3. Test Tally connection"
    echo ""
    echo "📖 Documentation:"
    echo "   - Quick Start: QUICK-START.md"
    echo "   - Full Docs: ELECTRON-AGENT.md"
    echo ""
else
    echo ""
    echo "❌ Installation failed. Please check errors above."
    exit 1
fi
