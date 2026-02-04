// Friendly Supabase stub to keep legacy calls from crashing while we migrate to Django.
// Returns empty data and no errors so pages won't redirect or throw.

function getLocalToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function fakeUser() {
  const token = getLocalToken();
  if (!token) return null;
  return { id: "local-user", email: "local@prep.local" };
}

export const supabase = {
  auth: {
    async getSession() {
      const user = fakeUser();
      return user
        ? { data: { session: { access_token: getLocalToken(), user } }, error: null }
        : { data: { session: null }, error: null };
    },
    async getUser() {
      const user = fakeUser();
      return { data: { user }, error: null };
    },
    async signOut() {
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
      }
      return { error: null };
    },
  },
  storage: {
    from() {
      return {
        async upload() {
          return { data: { path: "" }, error: null };
        },
        getPublicUrl() {
          return { data: { publicUrl: null } };
        },
        async createSignedUrl(path: string) {
          const base = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";
          return { data: { signedUrl: path ? `${base}/media/${path}` : null }, error: null };
        },
      };
    },
  },
  from() {
    const stub: any = {
      async select() {
        return stub;
      },
      async insert() {
        return { data: null, error: null };
      },
      async update() {
        return { data: null, error: null };
      },
      async delete() {
        return { data: null, error: null };
      },
      eq() {
        return stub;
      },
      in() {
        return stub;
      },
      order() {
        return stub;
      },
      not() {
        return stub;
      },
      is() {
        return stub;
      },
      single() {
        return { data: null, error: null };
      },
      limit() {
        return stub;
      },
      maybeSingle() {
        return { data: null, error: null };
      },
    };
    return stub;
  },
};
