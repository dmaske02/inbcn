/**
 * Supabase database types for the tables currently consumed by the application.
 *
 * This file intentionally follows the shape emitted by:
 *   supabase gen types typescript
 *
 * Replace this file with generated output once a Supabase project is linked.
 * Application code should import aliases from `types.ts`, not row definitions
 * from this file directly.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          language_id: string;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      languages: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          native_name: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sources: {
        Row: {
          created_at: string;
          default_category_id: string | null;
          default_language_id: string | null;
          external_identifier: string | null;
          feed_url: string | null;
          id: string;
          is_active: boolean;
          last_ingested_at: string | null;
          name: string;
          slug: string;
          source_type: Database["public"]["Enums"]["source_type"];
          trust_score: number | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      stories: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          canonical_url: string | null;
          category_id: string;
          content: string;
          created_at: string;
          created_by: string | null;
          external_author: string | null;
          external_id: string | null;
          external_url: string | null;
          featured_media_id: string | null;
          id: string;
          is_breaking: boolean;
          is_featured: boolean;
          is_sponsored: boolean;
          language_id: string;
          published_at: string | null;
          rejected_at: string | null;
          rejection_reason: string | null;
          scheduled_at: string | null;
          seo_description: string | null;
          seo_keywords: string[];
          seo_title: string | null;
          slug: string;
          source_id: string | null;
          status: Database["public"]["Enums"]["story_status"];
          story_type: Database["public"]["Enums"]["story_type"];
          submitted_at: string | null;
          summary: string;
          title: string;
          translation_group_id: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      source_type:
        | "newsdata_api"
        | "rss"
        | "website"
        | "social"
        | "manual";
      story_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "scheduled"
        | "published"
        | "rejected"
        | "archived";
      story_type: "aggregated" | "staff_article" | "citizen_report";
    };
    CompositeTypes: Record<string, never>;
  };
};
