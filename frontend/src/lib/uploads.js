import api, { API } from "@/lib/api";

/** Unified upload — admin uses JWT; widget passes clientId + sessionId. */
export async function uploadFile(file, { clientId, sessionId } = {}) {
  const fd = new FormData();
  fd.append("file", file);
  if (clientId) fd.append("client_id", clientId);
  if (sessionId) fd.append("session_id", sessionId);

  if (clientId && sessionId) {
    const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  }

  const r = await api.post("/uploads", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return r.data;
}
