#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
layout = (root / "src/app/(tabs)/_layout.tsx").read_text()
more = (root / "src/app/(tabs)/more.tsx").read_text()
spending = (root / "src/app/pricing/spending-history.tsx").read_text()
spending_card = (root / "src/components/pricing/SpendingSummaryCard.tsx").read_text()
app_config = (root / "app.config.ts").read_text()
eas_config = (root / "eas.json").read_text()

# The production persistent footer is frozen to the four core studio entries.
for marker in ('title: "Home"', 'title: "Face"', 'title: "Voice"', 'title: "Video"'):
    assert marker in layout, marker

# Secondary capabilities remain routable/discoverable but must not crowd the
# persistent footer. More, Music and Retail are explicitly hidden along with
# the other non-primary tab routes.
for hidden in ('more', 'settings', 'billing', 'media', 'music', 'retail'):
    marker = f'<Tabs.Screen name="{hidden}" options={{hiddenTabOptions}} />'
    assert marker in layout, marker

assert 'title: "More"' not in layout, 'More must not be a persistent footer item'
assert 'title: "Music"' not in layout, 'Music must not be a persistent footer item'
assert 'title: "Retail"' not in layout, 'Retail must not be a persistent footer item'

for marker in (
    'Multi-Person',
    'Saved Work',
    'Plans & Usage',
    'Spending & Transactions',
    'Notifications',
    'Account & Settings',
    'Help & Support',
    '/pricing/spending-history',
    '<SpendingSummaryCard token={token} />',
):
    assert marker in more, marker

for marker in ('Spending & transactions', 'Money paid', 'Credits purchased', 'TRANSACTION HISTORY'):
    assert marker in spending, marker

for marker in ('credits used', 'money paid', 'Money paid and credits used are shown separately.'):
    assert marker in spending_card, marker

# Production store identity is a launch gate. Development bundle/package IDs
# must never ship through the production EAS profile.
for marker in (
    'name: "desifaces.ai"',
    'scheme: "desifaces"',
    'bundleIdentifier: "ai.desifaces.app"',
    'package: "ai.desifaces.app"',
    '"production"',
    '"distribution": "store"',
    '"environment": "production"',
):
    assert marker in (app_config + eas_config), marker
for forbidden in ('desifaces.ai Dev', 'desifaces-dev', 'ai.desifaces.app.dev'):
    assert forbidden not in app_config, forbidden

# Mobile must not create a parallel pricing model or expose provider-specific policy.
for forbidden in ('credits_per_second', 'UPDATE pricing_', 'INSERT INTO pricing_', 'stripe_price_id'):
    assert forbidden not in more
    assert forbidden not in spending

print('V3_MOBILE_CAPABILITY_PARITY_SOURCE_TEST=PASS')
