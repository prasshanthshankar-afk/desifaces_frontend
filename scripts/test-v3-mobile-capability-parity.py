#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
layout = (root / "src/app/(tabs)/_layout.tsx").read_text()
more = (root / "src/app/(tabs)/more.tsx").read_text()
spending = (root / "src/app/pricing/spending-history.tsx").read_text()
spending_card = (root / "src/components/pricing/SpendingSummaryCard.tsx").read_text()
app_config = (root / "app.config.ts").read_text()
eas_config = (root / "eas.json").read_text()
story_route = (root / "src/app/(tabs)/face/story/[storyId].tsx").read_text()
multiperson_route = (root / "src/app/(tabs)/face/multi-person.tsx").read_text()
recent_panel = (root / "src/features/story/RecentStoriesMobilePanel.tsx").read_text()
face_cohort = (root / "src/features/face/MultiPersonFaceCohortDenseScreen.tsx").read_text()
piku = (root / "src/features/assistant/AssistantOverlay.tsx").read_text()
piku_api = (root / "src/features/assistant/api/assistant.ts").read_text()
director_api = (root / "src/features/face/api/multiPersonDirector.ts").read_text()

for marker in ('title: "Home"', 'title: "Face"', 'title: "Voice"', 'title: "Video"', 'title: "More"'):
    assert marker in layout, marker

# Secondary capabilities remain discoverable without crowding the primary tab bar.
for hidden in ('name="settings"', 'name="billing"', 'name="media"', 'name="music"', 'name="retail"'):
    assert hidden in layout, hidden

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

# Multi-Person Story must retain the same canonical stage progression as Web.
for marker in (
    'MultiPersonFaceSavedWorkScreen',
    'MultiPersonAudioWorkspaceScreen',
    'MultiPersonFusionDenseScreen',
    'MultiPersonStoryFinalScreen',
    'story_final',
):
    assert marker in story_route, marker

# Durable generated Face media must rehydrate from media_id after reload/resume,
# and status must come from canonical stage state rather than pricing readiness.
for marker in (
    'getFaceMediaReadUrl',
    'latestFaceOutput',
    'Identity locked',
    'Your Face is ready to review',
    'Creating this Face',
    'retry only this character',
):
    assert marker in face_cohort, marker

# Recent Story discovery/continuation mirrors the Web experience.
for marker in (
    'getRecentStories',
    '/api/director/stories/recent?limit=',
    'RecentStory',
):
    assert marker in director_api, marker
for marker in (
    'RecentStoriesMobilePanel',
    'Continue where you left off',
    '/(tabs)/face/story/[storyId]',
):
    assert marker in recent_panel + multiperson_route, marker
assert 'Not Found' in recent_panel, 'recent Story raw-404 guard missing'

# Piku mobile must preserve the same backend action contract and lightweight
# **bold** rendering behavior as Web; internal Story actions navigate instead of
# becoming another chat prompt.
for marker in ('href?: string | null', 'requires_confirmation?: boolean'):
    assert marker in piku_api, marker
for marker in (
    'renderPikuText',
    'storyIdFromActionHref',
    'handleAction',
    '/(tabs)/face/story/[storyId]',
    'messageBold',
):
    assert marker in piku, marker
assert 'onPress={() => setDraft(action.label)}' not in piku, 'legacy non-navigating Piku action remains'

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
