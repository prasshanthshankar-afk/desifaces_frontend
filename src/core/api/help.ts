import { CORE_BASE } from "../config/env";
import { api } from "./client";
import { endpoints } from "./endpoints";

export type HelpCategory = {
  key: string;
  title: string;
  description?: string | null;
  sort_order: number;
};

export type HelpArticle = {
  slug: string;
  category_key: string;
  title: string;
  summary?: string | null;
  body_markdown: string;
  keywords: string[];
  is_faq: boolean;
  sort_order: number;
};

export async function listHelpCategories() {
  return api.get<HelpCategory[]>(CORE_BASE, endpoints.help.categories);
}

export async function listFaqArticles() {
  return api.get<HelpArticle[]>(CORE_BASE, endpoints.help.faq);
}

export async function getHelpArticle(slug: string) {
  return api.get<HelpArticle>(CORE_BASE, endpoints.help.articleBySlug(slug));
}