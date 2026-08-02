export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          language_id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          language_id: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          language_id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_language_fkey"
            columns: ["parent_id", "language_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "language_id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          items_created: number
          items_failed: number
          items_fetched: number
          items_updated: number
          metadata: Json
          source_id: string
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          items_created?: number
          items_failed?: number
          items_fetched?: number
          items_updated?: number
          metadata?: Json
          source_id: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          items_created?: number
          items_failed?: number
          items_fetched?: number
          items_updated?: number
          metadata?: Json
          source_id?: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          native_name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          native_name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          native_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          alt_text: string | null
          bytes: number | null
          caption: string | null
          cloudinary_public_id: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          metadata: Json
          mime_type: string | null
          resource_format: string | null
          secure_url: string
          sort_order: number
          story_id: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          cloudinary_public_id: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          metadata?: Json
          mime_type?: string | null
          resource_format?: string | null
          secure_url: string
          sort_order?: number
          story_id?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          cloudinary_public_id?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          metadata?: Json
          mime_type?: string | null
          resource_format?: string | null
          secure_url?: string
          sort_order?: number
          story_id?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          preferred_language_id: string | null
          role: Database["public"]["Enums"]["profile_role"]
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
          preferred_language_id?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          preferred_language_id?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_preferred_language_id_fkey"
            columns: ["preferred_language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          expires_at: string | null
          id: string
          is_active: boolean
          language_id: string
          last_used_at: string | null
          p256dh_key: string
          profile_id: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          language_id: string
          last_used_at?: string | null
          p256dh_key: string
          profile_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          language_id?: string
          last_used_at?: string | null
          p256dh_key?: string
          profile_id?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          country: string | null
          created_at: string
          default_category_id: string | null
          default_language_id: string | null
          external_identifier: string | null
          feed_url: string | null
          id: string
          ingestion_priority: number
          is_active: boolean
          last_ingested_at: string | null
          name: string
          slug: string
          source_type: Database["public"]["Enums"]["source_type"]
          trust_score: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          default_category_id?: string | null
          default_language_id?: string | null
          external_identifier?: string | null
          feed_url?: string | null
          id?: string
          ingestion_priority?: number
          is_active?: boolean
          last_ingested_at?: string | null
          name: string
          slug: string
          source_type: Database["public"]["Enums"]["source_type"]
          trust_score?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          default_category_id?: string | null
          default_language_id?: string | null
          external_identifier?: string | null
          feed_url?: string | null
          id?: string
          ingestion_priority?: number
          is_active?: boolean
          last_ingested_at?: string | null
          name?: string
          slug?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          trust_score?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_default_category_language_fkey"
            columns: ["default_category_id", "default_language_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "language_id"]
          },
          {
            foreignKeyName: "sources_default_language_id_fkey"
            columns: ["default_language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          canonical_url: string | null
          category_id: string
          content: string
          created_at: string
          created_by: string | null
          external_author: string | null
          external_id: string | null
          external_image_url: string | null
          external_published_at: string | null
          external_url: string | null
          featured_media_id: string | null
          id: string
          is_breaking: boolean
          is_featured: boolean
          is_sponsored: boolean
          language_id: string
          published_at: string | null
          rejected_at: string | null
          rejection_reason: string | null
          scheduled_at: string | null
          search_document: unknown
          seo_description: string | null
          seo_keywords: string[]
          seo_title: string | null
          slug: string
          source_id: string | null
          status: Database["public"]["Enums"]["story_status"]
          story_type: Database["public"]["Enums"]["story_type"]
          submitted_at: string | null
          summary: string
          title: string
          translation_group_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          canonical_url?: string | null
          category_id: string
          content: string
          created_at?: string
          created_by?: string | null
          external_author?: string | null
          external_id?: string | null
          external_image_url?: string | null
          external_published_at?: string | null
          external_url?: string | null
          featured_media_id?: string | null
          id?: string
          is_breaking?: boolean
          is_featured?: boolean
          is_sponsored?: boolean
          language_id: string
          published_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          search_document?: unknown
          seo_description?: string | null
          seo_keywords?: string[]
          seo_title?: string | null
          slug: string
          source_id?: string | null
          status?: Database["public"]["Enums"]["story_status"]
          story_type: Database["public"]["Enums"]["story_type"]
          submitted_at?: string | null
          summary: string
          title: string
          translation_group_id?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          canonical_url?: string | null
          category_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          external_author?: string | null
          external_id?: string | null
          external_image_url?: string | null
          external_published_at?: string | null
          external_url?: string | null
          featured_media_id?: string | null
          id?: string
          is_breaking?: boolean
          is_featured?: boolean
          is_sponsored?: boolean
          language_id?: string
          published_at?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          search_document?: unknown
          seo_description?: string | null
          seo_keywords?: string[]
          seo_title?: string | null
          slug?: string
          source_id?: string | null
          status?: Database["public"]["Enums"]["story_status"]
          story_type?: Database["public"]["Enums"]["story_type"]
          submitted_at?: string | null
          summary?: string
          title?: string
          translation_group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_category_language_fkey"
            columns: ["category_id", "language_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "language_id"]
          },
          {
            foreignKeyName: "stories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_featured_media_id_fkey"
            columns: ["featured_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      media_type: "image" | "video" | "audio" | "document"
      profile_role: "admin" | "editor" | "writer" | "broadcaster" | "reader"
      source_type: "newsdata_api" | "rss" | "website" | "social" | "manual"
      story_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "scheduled"
        | "published"
        | "rejected"
        | "archived"
      story_type:
        | "aggregated"
        | "staff_article"
        | "citizen_report"
        | "external_article"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      media_type: ["image", "video", "audio", "document"],
      profile_role: ["admin", "editor", "writer", "broadcaster", "reader"],
      source_type: ["newsdata_api", "rss", "website", "social", "manual"],
      story_status: [
        "draft",
        "pending_review",
        "approved",
        "scheduled",
        "published",
        "rejected",
        "archived",
      ],
      story_type: [
        "aggregated",
        "staff_article",
        "citizen_report",
        "external_article",
      ],
    },
  },
} as const
