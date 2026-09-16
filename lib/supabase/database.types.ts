// Database types for the Greenways v1 schema.
// Shape matches `supabase gen types typescript`. Regenerate with `pnpm db:types`
// (local stack) or `supabase gen types typescript --project-id <ref>` once the
// hosted project is linked; docker-registry access is blocked in this build
// environment, so this file was written to match 20260915000001_init.sql.

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
      audit_log: {
        Row: {
          id: string;
          actor: string | null;
          action: string;
          property_id: string | null;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor?: string | null;
          action: string;
          property_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor?: string | null;
          action?: string;
          property_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      corners: {
        Row: {
          id: string;
          property_id: string;
          n: number;
          lat: number;
          lng: number;
          name: Json;
          stake: Json;
          approach_photo: string | null;
          stake_photo: string | null;
          locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          n: number;
          lat: number;
          lng: number;
          name?: Json;
          stake?: Json;
          approach_photo?: string | null;
          stake_photo?: string | null;
          locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          n?: number;
          lat?: number;
          lng?: number;
          name?: Json;
          stake?: Json;
          approach_photo?: string | null;
          stake_photo?: string | null;
          locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "corners_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      demo_scenarios: {
        Row: {
          id: string;
          property_id: string | null;
          name: string;
          config: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id?: string | null;
          name: string;
          config?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string | null;
          name?: string;
          config?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demo_scenarios_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      generation_jobs: {
        Row: {
          id: string;
          property_id: string;
          kind: string;
          status: string;
          higgsfield_job_id: string | null;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          kind: string;
          status?: string;
          higgsfield_job_id?: string | null;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          kind?: string;
          status?: string;
          higgsfield_job_id?: string | null;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "generation_jobs_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      invites: {
        Row: {
          id: string;
          email: string;
          role: Database["public"]["Enums"]["team_role"];
          invited_by: string | null;
          created_at: string;
          accepted_at: string | null;
          last_sent_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          role?: Database["public"]["Enums"]["team_role"];
          invited_by?: string | null;
          created_at?: string;
          accepted_at?: string | null;
          last_sent_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["team_role"];
          invited_by?: string | null;
          created_at?: string;
          accepted_at?: string | null;
          last_sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "team_users";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          id: string;
          property_id: string;
          type: string;
          slot: string;
          storage_path: string;
          status: Database["public"]["Enums"]["media_status"];
          source_photo: string | null;
          higgsfield_job_id: string | null;
          reject_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          type: string;
          slot: string;
          storage_path: string;
          status?: Database["public"]["Enums"]["media_status"];
          source_photo?: string | null;
          higgsfield_job_id?: string | null;
          reject_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          type?: string;
          slot?: string;
          storage_path?: string;
          status?: Database["public"]["Enums"]["media_status"];
          source_photo?: string | null;
          higgsfield_job_id?: string | null;
          reject_reason?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      properties: {
        Row: {
          id: string;
          slug: string;
          name: Json;
          address: string | null;
          county: string | null;
          acres: number | null;
          entrance_lat: number | null;
          entrance_lng: number | null;
          boundary: Json | null;
          geometry_source: string | null;
          status: Database["public"]["Enums"]["property_status"];
          sale_status: Database["public"]["Enums"]["sale_status"];
          demo_mode: boolean;
          test_lot: boolean;
          es_reviewed: boolean;
          es_reviewed_by: string | null;
          es_reviewed_at: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name?: Json;
          address?: string | null;
          county?: string | null;
          acres?: number | null;
          entrance_lat?: number | null;
          entrance_lng?: number | null;
          boundary?: Json | null;
          geometry_source?: string | null;
          status?: Database["public"]["Enums"]["property_status"];
          sale_status?: Database["public"]["Enums"]["sale_status"];
          demo_mode?: boolean;
          test_lot?: boolean;
          es_reviewed?: boolean;
          es_reviewed_by?: string | null;
          es_reviewed_at?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: Json;
          address?: string | null;
          county?: string | null;
          acres?: number | null;
          entrance_lat?: number | null;
          entrance_lng?: number | null;
          boundary?: Json | null;
          geometry_source?: string | null;
          status?: Database["public"]["Enums"]["property_status"];
          sale_status?: Database["public"]["Enums"]["sale_status"];
          demo_mode?: boolean;
          test_lot?: boolean;
          es_reviewed?: boolean;
          es_reviewed_by?: string | null;
          es_reviewed_at?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_es_reviewed_by_fkey";
            columns: ["es_reviewed_by"];
            isOneToOne: false;
            referencedRelation: "team_users";
            referencedColumns: ["id"];
          },
        ];
      };
      team_users: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          display_name: string | null;
          role: Database["public"]["Enums"]["team_role"];
          created_at: string;
          first_signed_in_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email: string;
          display_name?: string | null;
          role?: Database["public"]["Enums"]["team_role"];
          created_at?: string;
          first_signed_in_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          email?: string;
          display_name?: string | null;
          role?: Database["public"]["Enums"]["team_role"];
          created_at?: string;
          first_signed_in_at?: string | null;
        };
        Relationships: [];
      };
      walk_events: {
        Row: {
          id: number;
          session_id: string | null;
          name: string;
          data: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          session_id?: string | null;
          name: string;
          data?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          session_id?: string | null;
          name?: string;
          data?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "walk_events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "walk_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      walk_links: {
        Row: {
          id: string;
          property_id: string;
          kind: Database["public"]["Enums"]["link_kind"];
          token: string;
          ghl_contact_id: string | null;
          locale: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          kind: Database["public"]["Enums"]["link_kind"];
          token: string;
          ghl_contact_id?: string | null;
          locale?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          kind?: Database["public"]["Enums"]["link_kind"];
          token?: string;
          ghl_contact_id?: string | null;
          locale?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "walk_links_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      walk_sessions: {
        Row: {
          id: string;
          link_id: string | null;
          locale: string | null;
          started_at: string;
          ended_at: string | null;
          device: string | null;
        };
        Insert: {
          id?: string;
          link_id?: string | null;
          locale?: string | null;
          started_at?: string;
          ended_at?: string | null;
          device?: string | null;
        };
        Update: {
          id?: string;
          link_id?: string | null;
          locale?: string | null;
          started_at?: string;
          ended_at?: string | null;
          device?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "walk_sessions_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "walk_links";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_invited: {
        Args: { check_email: string };
        Returns: boolean;
      };
      is_team_member: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      write_audit: {
        Args: { p_action: string; p_property_id: string; p_detail?: Json };
        Returns: undefined;
      };
    };
    Enums: {
      team_role: "admin" | "editor";
      sale_status: "available" | "under_contract" | "sold";
      property_status: "draft" | "generating" | "review" | "published" | "error";
      media_status: "generated" | "approved" | "rejected";
      link_kind: "public" | "prospect";
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
