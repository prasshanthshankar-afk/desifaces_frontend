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

    assets: {
      upload: "/api/face/assets/upload",
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

      jobs: {
        list: (limit = 20) => `/api/face/creator/jobs?limit=${limit}`,
        status: (jobId: string) =>
          `/api/face/creator/jobs/${encodeURIComponent(jobId)}/status`,
      },
    },

    profiles: (limit = 50) => `/api/face/profiles?limit=${limit}`,

    config: {
      regions: (language = "en") =>
        `/api/face/config/regions?language=${encodeURIComponent(language)}`,
      contexts: "/api/face/config/contexts",
    },
  },

  audio: {
    root: "/",
    health: {
      v1: "/api/health/",
      plain: "/api/health",
      ready: "/api/health/ready",
    },

    tts: "/api/audio/tts",
    pricingPreview: "/api/audio/tts/pricing/preview",
    pricingPreviewCandidates: ["/api/audio/tts/pricing/preview"],

    jobs: {
      status: (jobId: string) =>
        `/api/audio/jobs/${encodeURIComponent(jobId)}/status`,
    },

    catalog: {
      locales: (endToEndOnly = true, enabledOnly = true) =>
        `/api/audio/catalog/locales?end_to_end_only=${endToEndOnly}&enabled_only=${enabledOnly}`,
      voices: (locale: string) =>
        `/api/audio/catalog/voices?locale=${encodeURIComponent(locale)}`,
      sync: "/api/audio/catalog/sync",
    },
  },

  fusion: {
    root: "/",
    health: {
      v1: "/api/health/",
      plain: "/api/health",
      ready: "/api/health/ready",
    },

    jobs: {
      pricingPreview: "/jobs/pricing/preview",
      pricingPreviewCandidates: ["/jobs/pricing/preview"],

      create: "/jobs",

      byId: (jobId: string) => `/jobs/${encodeURIComponent(jobId)}`,
      status: (jobId: string) => `/jobs/${encodeURIComponent(jobId)}`,
    },
  },

  pricing: {
    root: "/",
    quote: "/api/pricing/quote",

    reservations: {
      preview: "/api/pricing/reservations/preview",
      reserve: "/api/pricing/reservations/reserve",
      commit: "/api/pricing/reservations/commit",
      release: "/api/pricing/reservations/release",
      byId: (reservationId: string) =>
        `/api/pricing/reservations/${encodeURIComponent(reservationId)}`,
    },

    planSummaryCandidates: [
      "/api/pricing/plan-summary",
      "/api/pricing/account-summary",
      "/api/pricing/summary",
    ],

    usageSummaryCandidates: [
      "/api/pricing/usage-summary",
      "/api/pricing/usage",
      "/api/pricing/account-summary",
    ],
  },
} as const;
