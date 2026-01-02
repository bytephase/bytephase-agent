#!/bin/bash

# BytePhase Agent - Installation Helper
# This script removes macOS quarantine flag to allow installation

echo "═══════════════════════════════════════════"
echo "  BytePhase Agent - Installation Helper"
echo "═══════════════════════════════════════════"
echo ""

APP_PATH="/Applications/BytePhase Agent.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ BytePhase Agent not found in Applications"
    echo ""
    echo "Please:"
    echo "1. Open the DMG file"
    echo "2. Drag BytePhase Agent to Applications folder"
    echo "3. Run this script again"
    exit 1
fi

echo "Found BytePhase Agent ✓"
echo ""
echo "Removing security restrictions..."
echo "(You may be asked for your password)"
echo ""

sudo xattr -r -d com.apple.quarantine "$APP_PATH" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Security restrictions removed!"
    echo ""
    echo "You can now open BytePhase Agent normally."
    echo "Find it in Applications or use Spotlight (⌘+Space)"
    echo ""
    echo "Opening BytePhase Agent..."
    open "$APP_PATH"
else
    echo "⚠️  Could not remove restrictions automatically."
    echo ""
    echo "Manual steps:"
    echo "1. Right-click BytePhase Agent in Applications"
    echo "2. Select 'Open'"
    echo "3. Click 'Open' in the security dialog"
fi

echo ""
echo "═══════════════════════════════════════════"
