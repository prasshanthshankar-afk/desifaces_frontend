export const endpoints = {
  core: {
    root: "/",
    health: {
      v1: "/api/health/",
      plain: "/api/health",
      ready: "/api/health/ready",
    },
    auth: {
      register: "/api/auth/register",
      login: "/api/auth/login",
      refresh: "/api/auth/refresh",
      logout: "/api/auth/logout",
      forgotPassword: "/api/auth/forgot-password",
      resetPassword: "/api/auth/reset-password",
    },
  },

  dashboard: {
    root: "/",
    health: {
      v1: "/api/health/",
      plain: "/api/health",
      ready: "/api/health/ready",
    },
    home: (force = false) => `/api/dashboard/home?force=${force}`,
    header: "/api/dashboard/header",
    refresh: "/api/dashboard/refresh",
  },

  face: {
    root: "/",
    health: "/api/health",
    assets: { upload: "/api/face/assets/upload" },
    groupPhoto: {
      validate: "/api/face/creator/group-photo/validate",
      validateAsset: "/api/face/creator/group-photo/validate-asset",
    },
    generateLegacy: "/api/face/generate",
    jobsLegacy: {
      list: (limit = 20) => `/api/face/jobs?limit=${limit}`,
      byId: (jobId: string) => `/api/face/jobs/${encodeURIComponent(jobId)}`,
    },
    creator: {
      pricingPreview: "/api/face/creator/pricing/preview",
      pricingPreviewCandidates: ["/api/face/creator/pricing/preview"],
      generate: "/api/face/creator/generate",
      i2i: { contentSafetyCheck: "/api/face/creator/i2i/content-safety/check" },
      jobs: {
        list: (limit = 20) => `/api/face/creator/jobs?limit=${limit}`,
        status: (jobId: string) => `/api/face/creator/jobs/${encodeURIComponent(jobId)}/status`,
      },
    },
    profiles: (limit = 50) => `/api/face/profiles?limit=${limit}`,
    config: {
      regions: (language = "en") => `/api/face/config/regions?language=${encodeURIComponent(language)}`,
      countries: (language = "en") => `/api/face/config/countries?language=${encodeURIComponent(language)}`,
      subdivisions: (countryCode: string, language = "en") => `/api/face/config/subdivisions?country_code=${encodeURIComponent(countryCode)}&language=${encodeURIComponent(language)}`,
      contexts: "/api/face/config/contexts",
    },
  },

  audio: {
    root: "/",
    health: { v1: "/api/health/", plain: "/api/health", ready: "/api/health/ready" },
    tts: "/api/audio/tts",
    pricingPreview: "/api/audio/tts/pricing/preview",
    pricingPreviewCandidates: ["/api/audio/tts/pricing/preview"],
    jobs: { status: (jobId: string) => `/api/audio/jobs/${encodeURIComponent(jobId)}/status` },
    catalog: {
      locales: (endToEndOnly = true, enabledOnly = true) => `/api/audio/catalog/locales?end_to_end_only=${endToEndOnly}&enabled_only=${enabledOnly}`,
      countries: "/api/audio/catalog/countries",
      targetLanguages: (countryCode: string) => `/api/audio/catalog/target-languages?country_code=${encodeURIComponent(countryCode)}`,
      voices: (locale: string) => `/api/audio/catalog/voices?locale=${encodeURIComponent(locale)}`,
      sync: "/api/audio/catalog/sync",
    },
  },

  fusion: {
    root: "/",
    health: { v1: "/api/health/", plain: "/api/health", ready: "/api/health/ready" },
    jobs: {
      pricingPreview: "/jobs/pricing/preview",
      pricingPreviewCandidates: ["/jobs/pricing/preview"],
      create: "/jobs",
      byId: (jobId: string) => `/jobs/${encodeURIComponent(jobId)}`,
      status: (jobId: string) => `/jobs/${encodeURIComponent(jobId)}`,
    },
  },

  fusionExtension: {
    root: "/",
    health: { v1: "/api/health/", plain: "/api/health", ready: "/api/health/ready" },
    longform: {
      pricingPreview: "/api/longform/pricing/preview",
      create: "/api/longform/jobs",
      jobs: {
        create: "/api/longform/jobs",
        status: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}`,
        segments: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}/segments`,
      },
      byId: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}`,
      segments: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}/segments`,
    },
  },

  longform: {
    root: "/",
    pricingPreview: "/api/longform/pricing/preview",
    create: "/api/longform/jobs",
    jobs: {
      create: "/api/longform/jobs",
      status: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}`,
      segments: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}/segments`,
    },
    byId: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}`,
    segments: (jobId: string) => `/api/longform/jobs/${encodeURIComponent(jobId)}/segments`,
  },

  pricing: {
    root: "/",
    quote: "/api/pricing/quote",
    spending: {
      summary: (period: "month" | "quarter" | "year" | "yoy" = "month") => `/api/pricing/me/spending/summary?period=${encodeURIComponent(period)}`,
      transactions: (period: "month" | "quarter" | "year" | "yoy" = "year", kind = "all", limit = 50, offset = 0) => `/api/pricing/me/spending/transactions?period=${encodeURIComponent(period)}&kind=${encodeURIComponent(kind)}&limit=${limit}&offset=${offset}`,
    },
    reservations: {
      preview: "/api/pricing/reservations/preview",
      reserve: "/api/pricing/reservations/reserve",
      commit: "/api/pricing/reservations/commit",
      release: "/api/pricing/reservations/release",
      byId: (reservationId: string) => `/api/pricing/reservations/${encodeURIComponent(reservationId)}`,
    },
    payments: {
      methods: "/api/payments/payment-methods",
      plansCatalog: "/api/payments/plans/catalog",
      currentSubscription: "/api/payments/subscriptions/current",
      createSubscriptionCheckoutSession: "/api/payments/subscriptions/create-checkout-session",
      createCustomerPortalSession: "/api/payments/customer-portal/create-session",
      changeSubscription: "/api/payments/subscriptions/change",
      cancelSubscription: "/api/payments/subscriptions/cancel",
      reactivateSubscription: "/api/payments/subscriptions/reactivate",
    },
    planSummaryCandidates: ["/api/pricing/plan-summary", "/api/pricing/account-summary", "/api/pricing/summary"],
    usageSummaryCandidates: ["/api/pricing/usage-summary", "/api/pricing/usage", "/api/pricing/account-summary"],
  },

  director: {
    createRun: "/api/director/runs",
    run: (threadId: string) => `/api/director/runs/${encodeURIComponent(threadId)}`,
    resumeRun: (threadId: string) => `/api/director/runs/${encodeURIComponent(threadId)}/resume`,
    recentStories: (limit = 10) => `/api/director/stories/recent?limit=${Math.max(1, Math.min(25, Number(limit) || 10))}`,
    workspace: (storyId: string) => `/api/director/stories/${encodeURIComponent(storyId)}/workspace`,
    ensureWorkflow: (storyId: string) => `/api/director/stories/${encodeURIComponent(storyId)}/studio-workflows`,
    workflow: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}`,
    preflight: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/preflight`,
    advance: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/advance`,
    review: (reviewId: string) => `/api/director/studio-reviews/${encodeURIComponent(reviewId)}`,
    faceProfile: (workflowId: string, participantId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/face-profile`,
    sharedSceneProfile: (workflowId: string, participantId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/shared-scene-profile`,
    sharedScenePeopleApproval: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/shared-scene-people-approval`,
    sharedSceneState: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/shared-scene-state`,
    sharedSceneSource: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/shared-scene-source`,
    sharedSceneGroupPhotoSpec: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/shared-scene-group-photo-spec`,
    savedFace: (workflowId: string, participantId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/saved-face`,
    voiceProfile: (workflowId: string, participantId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/voice-profile`,
    conversationSettings: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/conversation-settings`,
    sharedScene: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/stage-runs/${encodeURIComponent(stageRunId)}/shared-scene`,
    sharedSceneDraft: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/stage-runs/${encodeURIComponent(stageRunId)}/shared-scene-draft`,
    sharedSceneVideoSettings: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/stage-runs/${encodeURIComponent(stageRunId)}/shared-scene-video-settings`,
    audioAutoConfigure: (workflowId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-autoconfigure`,
    facePreview: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/face-stages/${encodeURIComponent(stageRunId)}/pricing-preview`,
    faceDispatch: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/face-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    faceSync: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/face-stages/${encodeURIComponent(stageRunId)}/sync`,
    audioPreview: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-stages/${encodeURIComponent(stageRunId)}/pricing-preview`,
    audioDispatch: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    audioSync: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-stages/${encodeURIComponent(stageRunId)}/sync`,
    fusionPreview: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/pricing-preview`,
    fusionDispatch: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    fusionSync: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/sync`,
    storyFinalStitch: (workflowId: string, stageRunId: string) => `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/story-final-stages/${encodeURIComponent(stageRunId)}/stitch`,
  },

  notifications: {
    root: "/",
    list: "/api/notifications",
    unreadCount: "/api/notifications/unread-count",
    markRead: (id: string) => `/api/notifications/${encodeURIComponent(id)}/read`,
    markAllRead: "/api/notifications/read-all",
    preferences: "/api/notifications/preferences",
    registerDevice: "/api/notifications/devices/register",
  },

  support: {
    root: "/",
    contact: "/api/support/contact",
    requests: "/api/support/requests",
    byId: (id: string) => `/api/support/requests/${encodeURIComponent(id)}`,
    reply: (id: string) => `/api/support/requests/${encodeURIComponent(id)}/reply`,
  },

  help: {
    root: "/",
    faq: "/api/help/faq",
    categories: "/api/help/categories",
    articleBySlug: (slug: string) => `/api/help/articles/${encodeURIComponent(slug)}`,
  },
} as const;
