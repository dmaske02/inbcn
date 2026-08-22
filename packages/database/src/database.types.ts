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
      audit_events: {
        Row: { id: string; actor_id: string | null; action: string; subject_type: string; subject_id: string; metadata: Json; request_correlation_id: string | null; created_at: string }
        Insert: { id?: string; actor_id?: string | null; action: string; subject_type: string; subject_id: string; metadata?: Json; request_correlation_id?: string | null; created_at?: string }
        Update: { id?: string; actor_id?: string | null; action?: string; subject_type?: string; subject_id?: string; metadata?: Json; request_correlation_id?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "audit_events_actor_id_fkey"; columns: ["actor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      reporter_access_sync_attempts: {
        Row: {
          claim_token: string
          profile_id: string
          generation: number
          desired_role: string
          operation: string
          claimed_at: string
          completion_status: string
          completed_at: string | null
          failure_detail: string | null
        }
        Insert: {
          claim_token: string
          profile_id: string
          generation: number
          desired_role: string
          operation: string
          claimed_at: string
          completion_status?: string
          completed_at?: string | null
          failure_detail?: string | null
        }
        Update: {
          claim_token?: string
          profile_id?: string
          generation?: number
          desired_role?: string
          operation?: string
          claimed_at?: string
          completion_status?: string
          completed_at?: string | null
          failure_detail?: string | null
        }
        Relationships: [
          { foreignKeyName: "reporter_access_sync_attempts_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "reporter_profiles"; referencedColumns: ["profile_id"] },
        ]
      }
      reporter_applications: {
        Row: {
          id: string
          profile_id: string
          status: string
          legal_name: string
          date_of_birth: string
          age_18_declared: boolean
          home_city: string
          home_district: string
          home_state: string
          bio: string | null
          beats: string[]
          public_photo_url: string
          public_photo_id: string
          public_photo_verified_by: string | null
          public_photo_verified_at: string | null
          kyc_provider: string | null
          kyc_reference: string | null
          kyc_status: string
          kyc_start_token: string | null
          kyc_start_reserved_at: string | null
          kyc_started_at: string | null
          kyc_completed_at: string | null
          verified_legal_name: string | null
          verified_adult: boolean | null
          submitted_at: string | null
          completion_deadline: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          decision_reason: string | null
          approved_at: string | null
          rejected_at: string | null
          refund_eligible_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          status?: string
          legal_name: string
          date_of_birth: string
          age_18_declared?: boolean
          home_city: string
          home_district: string
          home_state: string
          bio?: string | null
          beats?: string[]
          public_photo_url: string
          public_photo_id: string
          public_photo_verified_by?: string | null
          public_photo_verified_at?: string | null
          kyc_provider?: string | null
          kyc_reference?: string | null
          kyc_status?: string
          kyc_start_token?: string | null
          kyc_start_reserved_at?: string | null
          kyc_started_at?: string | null
          kyc_completed_at?: string | null
          verified_legal_name?: string | null
          verified_adult?: boolean | null
          submitted_at?: string | null
          completion_deadline?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          decision_reason?: string | null
          approved_at?: string | null
          rejected_at?: string | null
          refund_eligible_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          status?: string
          legal_name?: string
          date_of_birth?: string
          age_18_declared?: boolean
          home_city?: string
          home_district?: string
          home_state?: string
          bio?: string | null
          beats?: string[]
          public_photo_url?: string
          public_photo_id?: string
          public_photo_verified_by?: string | null
          public_photo_verified_at?: string | null
          kyc_provider?: string | null
          kyc_reference?: string | null
          kyc_status?: string
          kyc_start_token?: string | null
          kyc_start_reserved_at?: string | null
          kyc_started_at?: string | null
          kyc_completed_at?: string | null
          verified_legal_name?: string | null
          verified_adult?: boolean | null
          submitted_at?: string | null
          completion_deadline?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          decision_reason?: string | null
          approved_at?: string | null
          rejected_at?: string | null
          refund_eligible_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "reporter_applications_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_applications_public_photo_verified_by_fkey"; columns: ["public_photo_verified_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_applications_reviewed_by_fkey"; columns: ["reviewed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      reporter_consents: {
        Row: { id: string; application_id: string; profile_id: string; notice_key: string; notice_version: string; locale: string; consented_at: string; withdrawn_at: string | null; created_at: string }
        Insert: { id?: string; application_id: string; profile_id: string; notice_key: string; notice_version: string; locale: string; consented_at?: string; withdrawn_at?: string | null; created_at?: string }
        Update: { id?: string; application_id?: string; profile_id?: string; notice_key?: string; notice_version?: string; locale?: string; consented_at?: string; withdrawn_at?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "reporter_consents_application_profile_fkey"; columns: ["application_id", "profile_id"]; isOneToOne: false; referencedRelation: "reporter_applications"; referencedColumns: ["id", "profile_id"] },
          { foreignKeyName: "reporter_consents_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      reporter_notifications: {
        Row: { id: string; profile_id: string; notification_type: string; message: string; destination: string | null; delivery_channel: string; delivery_status: string; delivered_at: string | null; read_at: string | null; created_at: string }
        Insert: { id?: string; profile_id: string; notification_type: string; message: string; destination?: string | null; delivery_channel?: string; delivery_status?: string; delivered_at?: string | null; read_at?: string | null; created_at?: string }
        Update: { id?: string; profile_id?: string; notification_type?: string; message?: string; destination?: string | null; delivery_channel?: string; delivery_status?: string; delivered_at?: string | null; read_at?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "reporter_notifications_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      reporter_payments: {
        Row: {
          id: string
          profile_id: string
          application_id: string | null
          purpose: string
          amount_paise: number
          currency: string
          payment_status: string
          refund_status: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          order_creation_token: string | null
          order_creation_reserved_at: string | null
          refund_request_token: string | null
          refund_request_reserved_at: string | null
          refund_attempt_count: number
          captured_at: string | null
          refund_eligible_at: string | null
          refund_requested_at: string | null
          refunded_at: string | null
          refund_failure_detail: string | null
          credited_membership_started_at: string | null
          credited_membership_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          application_id?: string | null
          purpose: string
          amount_paise?: number
          currency?: string
          payment_status?: string
          refund_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          order_creation_token?: string | null
          order_creation_reserved_at?: string | null
          refund_request_token?: string | null
          refund_request_reserved_at?: string | null
          refund_attempt_count?: number
          captured_at?: string | null
          refund_eligible_at?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          refund_failure_detail?: string | null
          credited_membership_started_at?: string | null
          credited_membership_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          application_id?: string | null
          purpose?: string
          amount_paise?: number
          currency?: string
          payment_status?: string
          refund_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          order_creation_token?: string | null
          order_creation_reserved_at?: string | null
          refund_request_token?: string | null
          refund_request_reserved_at?: string | null
          refund_attempt_count?: number
          captured_at?: string | null
          refund_eligible_at?: string | null
          refund_requested_at?: string | null
          refunded_at?: string | null
          refund_failure_detail?: string | null
          credited_membership_started_at?: string | null
          credited_membership_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "reporter_payments_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_payments_application_profile_fkey"; columns: ["application_id", "profile_id"]; isOneToOne: false; referencedRelation: "reporter_applications"; referencedColumns: ["id", "profile_id"] },
        ]
      }
      reporter_profiles: {
        Row: {
          profile_id: string
          public_slug: string
          legal_display_name: string
          avatar_url: string
          home_city: string
          home_district: string
          home_state: string
          bio: string | null
          beats: string[]
          public_status: string
          membership_started_at: string
          membership_expires_at: string
          membership_grace_ends_at: string
          can_publish_directly: boolean
          direct_publish_granted_by: string | null
          direct_publish_granted_at: string | null
          direct_publish_revoked_by: string | null
          direct_publish_revoked_at: string | null
          can_broadcast_live: boolean
          live_broadcast_granted_by: string | null
          live_broadcast_granted_at: string | null
          live_broadcast_revoked_by: string | null
          live_broadcast_revoked_at: string | null
          public_photo_verified_by: string
          public_photo_verified_at: string
          suspended_by: string | null
          suspended_at: string | null
          suspension_reason: string | null
          access_sync_status: string
          access_sync_operation: string | null
          access_sync_failure_detail: string | null
          access_sync_generation: number
          access_sync_desired_role: string
          access_sync_claim_token: string | null
          access_sync_claimed_at: string | null
          access_sync_claim_generation: number | null
          access_sync_completed_token: string | null
          access_sync_updated_at: string
          suspension_token: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          profile_id: string
          public_slug: string
          legal_display_name: string
          avatar_url: string
          home_city: string
          home_district: string
          home_state: string
          bio?: string | null
          beats?: string[]
          public_status?: string
          membership_started_at: string
          membership_expires_at: string
          membership_grace_ends_at: string
          can_publish_directly?: boolean
          direct_publish_granted_by?: string | null
          direct_publish_granted_at?: string | null
          direct_publish_revoked_by?: string | null
          direct_publish_revoked_at?: string | null
          can_broadcast_live?: boolean
          live_broadcast_granted_by?: string | null
          live_broadcast_granted_at?: string | null
          live_broadcast_revoked_by?: string | null
          live_broadcast_revoked_at?: string | null
          public_photo_verified_by: string
          public_photo_verified_at: string
          suspended_by?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          access_sync_status?: string
          access_sync_operation?: string | null
          access_sync_failure_detail?: string | null
          access_sync_generation?: number
          access_sync_desired_role?: string
          access_sync_claim_token?: string | null
          access_sync_claimed_at?: string | null
          access_sync_claim_generation?: number | null
          access_sync_completed_token?: string | null
          access_sync_updated_at?: string
          suspension_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          profile_id?: string
          public_slug?: string
          legal_display_name?: string
          avatar_url?: string
          home_city?: string
          home_district?: string
          home_state?: string
          bio?: string | null
          beats?: string[]
          public_status?: string
          membership_started_at?: string
          membership_expires_at?: string
          membership_grace_ends_at?: string
          can_publish_directly?: boolean
          direct_publish_granted_by?: string | null
          direct_publish_granted_at?: string | null
          direct_publish_revoked_by?: string | null
          direct_publish_revoked_at?: string | null
          can_broadcast_live?: boolean
          live_broadcast_granted_by?: string | null
          live_broadcast_granted_at?: string | null
          live_broadcast_revoked_by?: string | null
          live_broadcast_revoked_at?: string | null
          public_photo_verified_by?: string
          public_photo_verified_at?: string
          suspended_by?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          access_sync_status?: string
          access_sync_operation?: string | null
          access_sync_failure_detail?: string | null
          access_sync_generation?: number
          access_sync_desired_role?: string
          access_sync_claim_token?: string | null
          access_sync_claimed_at?: string | null
          access_sync_claim_generation?: number | null
          access_sync_completed_token?: string | null
          access_sync_updated_at?: string
          suspension_token?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "reporter_profiles_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_profiles_direct_publish_granted_by_fkey"; columns: ["direct_publish_granted_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_profiles_direct_publish_revoked_by_fkey"; columns: ["direct_publish_revoked_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_profiles_live_broadcast_granted_by_fkey"; columns: ["live_broadcast_granted_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_profiles_live_broadcast_revoked_by_fkey"; columns: ["live_broadcast_revoked_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_profiles_public_photo_verified_by_fkey"; columns: ["public_photo_verified_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reporter_profiles_suspended_by_fkey"; columns: ["suspended_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      webhook_events: {
        Row: { id: string; provider: string; provider_event_id: string; event_type: string; signature_verified_at: string; processing_status: string; attempt_count: number; processing_token: string | null; failure_detail: string | null; subject_type: string | null; subject_id: string | null; processed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; provider: string; provider_event_id: string; event_type: string; signature_verified_at: string; processing_status?: string; attempt_count?: number; processing_token?: string | null; failure_detail?: string | null; subject_type?: string | null; subject_id?: string | null; processed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; provider?: string; provider_event_id?: string; event_type?: string; signature_verified_at?: string; processing_status?: string; attempt_count?: number; processing_token?: string | null; failure_detail?: string | null; subject_type?: string | null; subject_id?: string | null; processed_at?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      breaking_alerts: {
        Row: { id: string; title: string; message: string; type: string; placement: string; status: string; is_active: boolean; priority: number; target_scope: string; language_id: string; category_id: string | null; story_id: string | null; background_color: string; text_color: string; dismissible: boolean; start_at: string; end_at: string | null; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; title: string; message: string; type: string; placement: string; status?: string; is_active?: boolean; priority?: number; target_scope?: string; language_id: string; category_id?: string | null; story_id?: string | null; background_color?: string; text_color?: string; dismissible?: boolean; start_at?: string; end_at?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; title?: string; message?: string; type?: string; placement?: string; status?: string; is_active?: boolean; priority?: number; target_scope?: string; language_id?: string; category_id?: string | null; story_id?: string | null; background_color?: string; text_color?: string; dismissible?: boolean; start_at?: string; end_at?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "breaking_alerts_language_id_fkey"; columns: ["language_id"]; isOneToOne: false; referencedRelation: "languages"; referencedColumns: ["id"] },
          { foreignKeyName: "breaking_alerts_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "breaking_alerts_story_id_fkey"; columns: ["story_id"]; isOneToOne: false; referencedRelation: "stories"; referencedColumns: ["id"] },
          { foreignKeyName: "breaking_alerts_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      homepage_configurations: {
        Row: { id: string; language_id: string; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; language_id: string; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; language_id?: string; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "homepage_configurations_language_id_fkey"; columns: ["language_id"]; isOneToOne: true; referencedRelation: "languages"; referencedColumns: ["id"] },
          { foreignKeyName: "homepage_configurations_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "homepage_configurations_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      homepage_sections: {
        Row: { id: string; homepage_configuration_id: string; block_id: string; title: string; block_type: string; renderer: string; position: number; container: string; width: string; enabled: boolean; starts_at: string | null; ends_at: string | null; configuration: Json; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; homepage_configuration_id: string; block_id: string; title: string; block_type: string; renderer: string; position: number; container?: string; width?: string; enabled?: boolean; starts_at?: string | null; ends_at?: string | null; configuration?: Json; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; homepage_configuration_id?: string; block_id?: string; title?: string; block_type?: string; renderer?: string; position?: number; container?: string; width?: string; enabled?: boolean; starts_at?: string | null; ends_at?: string | null; configuration?: Json; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "homepage_sections_homepage_configuration_id_fkey"; columns: ["homepage_configuration_id"]; isOneToOne: false; referencedRelation: "homepage_configurations"; referencedColumns: ["id"] },
          { foreignKeyName: "homepage_sections_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "homepage_sections_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      live_streams: {
        Row: {
          id: string
          language_id: string
          internal_name: string
          title: string
          description: string
          provider: "youtube" | "hls"
          provider_stream_id: string | null
          stream_url: string | null
          external_watch_url: string | null
          poster_url: string | null
          poster_alt_text: string | null
          status: "draft" | "scheduled" | "live" | "offline" | "archived"
          autoplay: boolean
          muted: boolean
          starts_at: string | null
          ends_at: string | null
          offline_message: string | null
          related_category_id: string | null
          related_story_id: string | null
          seo_title: string | null
          seo_description: string | null
          social_image_url: string | null
          created_by: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          language_id: string
          internal_name: string
          title: string
          description: string
          provider: "youtube" | "hls"
          provider_stream_id?: string | null
          stream_url?: string | null
          external_watch_url?: string | null
          poster_url?: string | null
          poster_alt_text?: string | null
          status?: "draft" | "scheduled" | "live" | "offline" | "archived"
          autoplay?: boolean
          muted?: boolean
          starts_at?: string | null
          ends_at?: string | null
          offline_message?: string | null
          related_category_id?: string | null
          related_story_id?: string | null
          seo_title?: string | null
          seo_description?: string | null
          social_image_url?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          language_id?: string
          internal_name?: string
          title?: string
          description?: string
          provider?: "youtube" | "hls"
          provider_stream_id?: string | null
          stream_url?: string | null
          external_watch_url?: string | null
          poster_url?: string | null
          poster_alt_text?: string | null
          status?: "draft" | "scheduled" | "live" | "offline" | "archived"
          autoplay?: boolean
          muted?: boolean
          starts_at?: string | null
          ends_at?: string | null
          offline_message?: string | null
          related_category_id?: string | null
          related_story_id?: string | null
          seo_title?: string | null
          seo_description?: string | null
          social_image_url?: string | null
          created_by?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "live_streams_language_id_fkey"; columns: ["language_id"]; isOneToOne: false; referencedRelation: "languages"; referencedColumns: ["id"] },
          { foreignKeyName: "live_streams_related_category_id_fkey"; columns: ["related_category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "live_streams_related_story_id_fkey"; columns: ["related_story_id"]; isOneToOne: false; referencedRelation: "stories"; referencedColumns: ["id"] },
          { foreignKeyName: "live_streams_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "live_streams_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
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
          source_id: string | null
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
          source_id?: string | null
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
          source_id?: string | null
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
          credit: string | null
          deleted_at: string | null
          deleted_by: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          metadata: Json
          mime_type: string | null
          original_filename: string | null
          resource_format: string | null
          secure_url: string
          sort_order: number
          story_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          cloudinary_public_id: string
          created_at?: string
          created_by?: string | null
          credit?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          media_type: Database["public"]["Enums"]["media_type"]
          metadata?: Json
          mime_type?: string | null
          original_filename?: string | null
          resource_format?: string | null
          secure_url: string
          sort_order?: number
          story_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          cloudinary_public_id?: string
          created_at?: string
          created_by?: string | null
          credit?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          metadata?: Json
          mime_type?: string | null
          original_filename?: string | null
          resource_format?: string | null
          secure_url?: string
          sort_order?: number
          story_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
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
            foreignKeyName: "media_deleted_by_fkey"
            columns: ["deleted_by"]
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
          {
            foreignKeyName: "media_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          reporter_suspended_at: string | null
          reporter_suspended_by: string | null
          reporter_suspension_reason: string | null
          reporter_suspension_token: string | null
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
          reporter_suspended_at?: string | null
          reporter_suspended_by?: string | null
          reporter_suspension_reason?: string | null
          reporter_suspension_token?: string | null
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
          reporter_suspended_at?: string | null
          reporter_suspended_by?: string | null
          reporter_suspension_reason?: string | null
          reporter_suspension_token?: string | null
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
          {
            foreignKeyName: "profiles_reporter_suspended_by_fkey"
            columns: ["reporter_suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      story_locations: {
        Row: {
          accuracy_meters: number
          captured_at: string
          id: string
          latitude: number
          legal_hold: boolean
          locality: string
          longitude: number
          received_at: string
          retention_due_at: string | null
          revision_id: string
          story_id: string
        }
        Insert: {
          accuracy_meters: number
          captured_at: string
          id?: string
          latitude: number
          legal_hold?: boolean
          locality: string
          longitude: number
          received_at?: string
          retention_due_at?: string | null
          revision_id: string
          story_id: string
        }
        Update: {
          accuracy_meters?: number
          captured_at?: string
          id?: string
          latitude?: number
          legal_hold?: boolean
          locality?: string
          longitude?: number
          received_at?: string
          retention_due_at?: string | null
          revision_id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_locations_revision_story_fkey"
            columns: ["revision_id", "story_id"]
            isOneToOne: true
            referencedRelation: "story_revisions"
            referencedColumns: ["id", "story_id"]
          },
          {
            foreignKeyName: "story_locations_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_revisions: {
        Row: {
          associated_media_ids: string[]
          id: string
          review_outcome: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision_number: number
          snapshot: Json
          story_id: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          associated_media_ids?: string[]
          id?: string
          review_outcome?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_number: number
          snapshot: Json
          story_id: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          associated_media_ids?: string[]
          id?: string
          review_outcome?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_number?: number
          snapshot?: Json
          story_id?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_revisions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_revisions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_revisions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          external_image_width: number | null
          external_image_height: number | null
          external_published_at: string | null
          external_url: string | null
          event_occurred_at: string | null
          featured_media_id: string | null
          id: string
          is_breaking: boolean
          is_featured: boolean
          is_reporter_story: boolean
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
          external_image_width?: number | null
          external_image_height?: number | null
          external_published_at?: string | null
          external_url?: string | null
          event_occurred_at?: string | null
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
          external_image_width?: number | null
          external_image_height?: number | null
          external_published_at?: string | null
          external_url?: string | null
          event_occurred_at?: string | null
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
      public_reporter_profiles: {
        Row: {
          public_slug: string | null
          legal_display_name: string | null
          avatar_url: string | null
          public_status: string | null
          home_district: string | null
          bio: string | null
          beats: string[] | null
          published_story_count: number | null
        }
        Relationships: []
      }
      ingest_run_dashboard: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          failure_reason: string | null
          id: string
          items_created: number
          items_failed: number
          items_fetched: number
          items_updated: number
          metadata_duplicates: number
          metadata_skipped: number
          source_id: string | null
          source_name: string
          started_at: string | null
          status: string
          triggered_by: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_reporter_payment: {
        Args: { p_razorpay_order_id: string; p_razorpay_payment_id: string; p_amount_paise: number; p_currency: string; p_captured_at: string }
        Returns: string
      }
      approve_reporter_application: { Args: { p_application_id: string; p_public_photo_identity_match: boolean }; Returns: string }
      claim_razorpay_webhook_event: {
        Args: { p_event_id: string; p_event_type: string }
        Returns: Json
      }
      claim_reporter_access_sync: { Args: { p_profile_id: string }; Returns: Json }
      claim_kyc_webhook_event: { Args: { p_event_id: string; p_event_type: string }; Returns: Json }
      claim_auto_import_batch: {
        Args: { p_started_at: string; p_lock_expires_at: string; p_queue_size: number; p_force?: boolean }
        Returns: Json
      }
      delete_homepage_section: { Args: { section_id: string }; Returns: undefined }
      delete_homepage_section_if_current: { Args: { section_id: string; expected_updated_at: string; expected_order: string[] }; Returns: boolean }
      duplicate_homepage_section_after: { Args: { source_section_id: string; expected_updated_at: string; expected_order: string[]; new_block_id: string; new_title: string }; Returns: string | null }
      direct_publish_reporter_story: {
        Args: {
          p_story_id: string
          p_latitude: number
          p_longitude: number
          p_accuracy_meters: number
          p_captured_at: string
          p_locality: string
        }
        Returns: Json
      }
      complete_kyc_webhook_event: {
        Args: { p_event_id: string; p_processing_token: string; p_provider: string; p_reference: string; p_verified: boolean; p_legal_name: string | null; p_adult: boolean | null; p_verified_at: string }
        Returns: boolean
      }
      complete_razorpay_payment_webhook: {
        Args: { p_event_id: string; p_processing_token: string; p_razorpay_order_id: string; p_razorpay_payment_id: string; p_amount_paise: number; p_currency: string; p_captured_at: string }
        Returns: boolean
      }
      complete_razorpay_refund_failure_webhook: {
        Args: { p_event_id: string; p_processing_token: string; p_razorpay_refund_id: string; p_razorpay_payment_id: string; p_amount_paise: number; p_currency: string }
        Returns: boolean
      }
      complete_razorpay_refund_webhook: {
        Args: { p_event_id: string; p_processing_token: string; p_razorpay_refund_id: string; p_razorpay_payment_id: string; p_amount_paise: number; p_currency: string }
        Returns: boolean
      }
      complete_reporter_order: {
        Args: { p_payment_id: string; p_order_creation_token: string; p_razorpay_order_id: string }
        Returns: boolean
      }
      complete_reporter_media_upload: {
        Args: {
          p_profile_id: string
          p_access_generation: number
          p_story_id: string
          p_asset_id: string
          p_media_type: Database["public"]["Enums"]["media_type"]
          p_public_id: string
          p_secure_url: string
          p_resource_format: string
          p_mime_type: string
          p_title: string
          p_original_filename: string
          p_alt_text: string | null
          p_width: number | null
          p_height: number | null
          p_duration_seconds: number | null
          p_bytes: number
          p_provider_created_at: string
        }
        Returns: string
      }
      complete_reporter_kyc_start: { Args: { p_application_id: string; p_profile_id: string; p_reservation_token: string; p_provider: string; p_reference: string }; Returns: boolean }
      complete_reporter_access_sync: {
        Args: { p_profile_id: string; p_generation: number; p_claim_token: string; p_succeeded: boolean; p_failure_detail: string | null }
        Returns: Json
      }
      fail_razorpay_webhook_event: {
        Args: { p_event_id: string; p_processing_token: string; p_failure_detail: string }
        Returns: boolean
      }
      fail_kyc_webhook_event: { Args: { p_event_id: string; p_processing_token: string; p_failure_detail: string }; Returns: boolean }
      fail_reporter_order: {
        Args: { p_payment_id: string; p_order_creation_token: string }
        Returns: boolean
      }
      is_reporter_story: {
        Args: { "": Database["public"]["Tables"]["stories"]["Row"] }
        Returns: boolean
      }
      fail_reporter_refund_request: {
        Args: { p_payment_id: string; p_refund_request_token: string }
        Returns: boolean
      }
      mark_overdue_reporter_application: { Args: { p_application_id: string }; Returns: string }
      move_homepage_section: { Args: { section_id: string; direction: string }; Returns: undefined }
      move_homepage_section_to: { Args: { section_id: string; target_position: number }; Returns: undefined }
      retire_media_asset: { Args: { media_id: string; expected_updated_at: string }; Returns: string }
      restore_media_asset: { Args: { media_id: string; expected_updated_at: string }; Returns: string }
      reject_reporter_application: { Args: { p_application_id: string; p_decision_reason: string }; Returns: string }
      reinstate_reporter: { Args: { p_profile_id: string }; Returns: string }
      record_reporter_refund_request: {
        Args: { p_payment_id: string; p_refund_request_token: string; p_razorpay_refund_id: string; p_razorpay_payment_id: string; p_amount_paise: number; p_currency: string }
        Returns: boolean
      }
      reserve_reporter_order: {
        Args: { p_profile_id: string; p_application_id: string | null; p_purpose: string; p_required_consents: Json }
        Returns: Json
      }
      reserve_reporter_refund: {
        Args: { p_payment_id: string; p_actor_id: string }
        Returns: Json
      }
      request_reporter_changes: {
        Args: { p_story_id: string; p_revision_id: string; p_reason: string }
        Returns: Json
      }
      save_reporter_story_draft: {
        Args: {
          p_story_id: string | null
          p_language_id: string
          p_category_id: string
          p_title: string
          p_summary: string
          p_content: string
          p_event_occurred_at: string
          p_media_ids: string[]
          p_featured_media_id: string | null
        }
        Returns: Json
      }
      release_reporter_kyc_start: { Args: { p_application_id: string; p_profile_id: string; p_reservation_token: string }; Returns: boolean }
      reserve_reporter_kyc_start: { Args: { p_application_id: string; p_profile_id: string }; Returns: string | null }
      submit_reporter_story: {
        Args: {
          p_story_id: string
          p_latitude: number
          p_longitude: number
          p_accuracy_meters: number
          p_captured_at: string
          p_locality: string
        }
        Returns: Json
      }
      suspend_reporter: { Args: { p_profile_id: string; p_reason: string }; Returns: string }
      withdraw_reporter_story: { Args: { p_story_id: string }; Returns: Json }
    }
    Enums: {
      media_type: "image" | "video" | "audio" | "document"
      profile_role: "admin" | "editor" | "writer" | "broadcaster" | "reader" | "reporter"
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
      profile_role: ["admin", "editor", "writer", "broadcaster", "reader", "reporter"],
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
