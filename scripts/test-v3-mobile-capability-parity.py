#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
layout = (root / "src/app/(tabs)/_layout.tsx").read_text()
more = (root / "src/app/(tabs)/more.tsx").read_text()
spending = (root / "src/app/pricing/spending-history.tsx").read_text()
spending_card = (root / "src/components/pricing/SpendingSummaryCard.tsx").read_text()
spending_api = (root / "src/core/pricing/spendingApi.ts").read_text()
app_config = (root / "app.config.ts").read_text()
eas_config = (root / "eas.json").read_text()
story_route = (root / "src/app/(tabs)/face/story/[storyId].tsx").read_text()
multiperson_route = (root / "src/app/(tabs)/face/multi-person.tsx").read_text()
recent_panel = (root / "src/features/story/RecentStoriesMobilePanel.tsx").read_text()
face_cohort = (root / "src/features/face/MultiPersonFaceCohortDenseScreen.tsx").read_text()
audio_api = (root / "src/features/audio/api/multiPersonStory.ts").read_text()
media_viewer = (root / "src/app/(tabs)/media/viewer.tsx").read_text()
story_final = (root / "src/features/story/MultiPersonStoryFinalScreen.tsx").read_text()
piku = (root / "src/features/assistant/AssistantOverlay.tsx").read_text()
piku_api = (root / "src/features/assistant/api/assistant.ts").read_text()
director_api = (root / "src/features/face/api/multiPersonDirector.ts").read_text()

shared_scene_screen = (root / "src/features/face/SharedSceneSetupScreen.tsx").read_text()
shared_scene_api = (root / "src/features/face/api/sharedScene.ts").read_text()
shared_scene_fusion = (root / "src/features/fusion/SharedSceneFusionScreen.tsx").read_text()
media_library = (root / "src/features/media/MediaLibraryScreen.tsx").read_text()
library_taxonomy = (root / "src/features/media/libraryTaxonomy.ts").read_text()

# Mobile intentionally keeps the primary tab bar compact. "More" remains a
# hidden route reached through the app menu rather than a fifth visible tab.
for marker in ('title: "Home"', 'title: "Face"', 'title: "Voice"', 'title: "Video"'):
    assert marker in layout, marker

# Secondary capabilities remain discoverable without crowding the primary tab bar.
for hidden in ('name="more"', 'name="settings"', 'name="billing"', 'name="media"'):
    assert hidden in layout, hidden

for removed in ('name="music"', 'name="retail"'):
    assert removed not in layout, removed
assert not (root / "src/app/(tabs)/music").exists(), "music placeholder tab tree must not ship"
assert not (root / "src/app/(tabs)/retail").exists(), "retail placeholder tab tree must not ship"

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

# Match the Web BFF pricing identity contract so spending routes receive the
# authenticated user selector expected by svc-pricing in production.
for marker in ('normalizeBearer', 'jwtUserId', '"X-User-Id"', 'endpoints.pricing.spending.summary', 'endpoints.pricing.spending.transactions'):
    assert marker in spending_api, marker

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

# Durable generated Audio must match the Web contract: media_asset_id is the
# durable identity and svc-audio mints a fresh read URL after resume/reload.
for marker in (
    'AUDIO_BASE',
    'getAudioMediaReadUrl',
    '/api/audio/assets/${encodeURIComponent(mediaAssetId)}/read-url',
    'hydrateDurableAudioUrl',
    'media_asset_id',
    'audio_url: readUrl',
):
    assert marker in audio_api, marker
assert 'return hydrateDurableAudioUrl(result);' in audio_api, 'Audio sync does not hydrate durable read URL'

# Final Story playback must use durable media identity/read-url rather than
# depending only on generation-time video URLs.
for marker in ('finalMediaId', 'getStoryFinalMediaReadUrl', 'media?.read_url'):
    assert marker in story_final, marker

# Download/share parity is intentionally compact on mobile but must preserve the
# same user capabilities for image/audio/video outputs.
for marker in (
    'Download PNG',
    'Download MP3',
    'Download MP4',
    'downloadUrl',
    'Share',
):
    assert marker in media_viewer, marker

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

# Group-photo launch parity: group image creation supports 2+ people while
# shared-scene Audio/Video remains limited to exactly two people for launch.
for marker in (
    'supported?: boolean',
    'max_people?: number',
    'reason?: string | null',
    'speaker_targets?: Record<string',
    'dimensions?: SharedSceneDimensions | null',
):
    assert marker in shared_scene_api, marker

for marker in (
    'Group photos can include 2 or more people.',
    'Video conversations and lip-sync currently support 2 people only.',
    'No Audio or Video credits will be requested',
    'Approve & save group photo',
    'group_photo_complete',
    'setTargets(hydratedTargets)',
    'canonical.group_photo?.speaker_targets',
    'canonical.group_photo?.dimensions',
    'Support for larger group conversations is planned for a future release.',
):
    assert marker in shared_scene_screen, marker

for marker in (
    'state.video?.supported === false',
    'state.people.speaker_count !== 2',
    'Support for larger group conversations is planned for a future release.',
):
    assert marker in shared_scene_fusion, marker

assert '3–4 person group-photo video generation will be introduced after additional testing.' not in shared_scene_fusion
assert '3–4 person group-photo video and lip-sync will be introduced after additional testing.' not in shared_scene_screen

# Saved Work keeps distinct group/multi-person taxonomy and exposes image/video
# eligibility for group photos without inventing client-side pricing rules.
for marker in (
    '"group-photos"',
    '"group-videos"',
    '"group-photo-conversation"',
    '"multi-person-conversation"',
):
    assert marker in library_taxonomy, marker

for marker in (
    'groupCapabilityLabel',
    'Image only · ${count} people',
    'Video eligible · 2 people',
    'savedWorkCategory(item)',
):
    assert marker in media_library, marker

# Mobile must not create a parallel pricing model or expose provider-specific policy.
for forbidden in ('credits_per_second', 'UPDATE pricing_', 'INSERT INTO pricing_', 'stripe_price_id'):
    assert forbidden not in more
    assert forbidden not in spending

print('V3_MOBILE_CAPABILITY_PARITY_SOURCE_TEST=PASS')
