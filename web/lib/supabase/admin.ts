// Stub admin Supabase client to satisfy legacy imports while migrating to Django.
export const supabaseAdmin = {
  auth: {
    async getUser() {
      return { data: null, error: { message: "Supabase admin stubbed out" } };
    },
    admin: {
      async createUser() {
        return { data: null, error: { message: "Supabase admin stubbed out" } };
      },
    },
  },
  from() {
    const stub = {
      async select() {
        return { data: [], error: { message: "Supabase admin stubbed out" } };
      },
      async insert() {
        return { data: null, error: { message: "Supabase admin stubbed out" } };
      },
      async update() {
        return { data: null, error: { message: "Supabase admin stubbed out" } };
      },
      async delete() {
        return { data: null, error: { message: "Supabase admin stubbed out" } };
      },
      eq() {
        return stub;
      },
      in() {
        return stub;
      },
      single() {
        return { data: null, error: { message: "Supabase admin stubbed out" } };
      },
    };
    return stub;
  },
  storage: {
    from() {
      return {
        async upload() {
          return { error: { message: "Supabase admin storage stubbed out" } };
        },
        async createSignedUrl() {
          return { data: { signedUrl: null }, error: { message: "Supabase admin storage stubbed out" } };
        },
      };
    },
  },
};
