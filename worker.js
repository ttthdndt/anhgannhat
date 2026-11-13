// Cloudflare Worker: nhan file va luu thang vao folder uploads/ tren GitHub.
// Cai dat Secrets/Variables: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO,
// ALLOWED_ORIGIN, (khuyen nghi) UPLOAD_KEY, (tuy chon) GITHUB_BRANCH.
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const EXTENSIONS = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
  "image/avif": "avif"
};

function asBase64(bytes) {
  const chunks = [];
  // 24576 chia het cho 3 => khong them padding vao giua chuoi base64.
  const chunkSize = 24576;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(i, i + chunkSize))));
  }
  return chunks.join("");
}

function sendJSON(data, status, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, X-Upload-Key";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    const reqOrigin = request.headers.get("Origin") || "";
    const allowedOrigin = (env.ALLOWED_ORIGIN || "").trim().replace(/\/$/, "");
    const pathname = new URL(request.url).pathname;
    // Endpoint kiểm tra công khai, không lộ token hoặc mật mã.
    // Cho phép website biết rõ Worker có hoạt động và ALLOWED_ORIGIN có khớp không.
    if (request.method === "GET" && pathname === "/health") {
      return sendJSON({
        ok: true,
        service: "github-photo-uploader",
        allowed_origin: allowedOrigin,
        github_configured: Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO),
        upload_key_required: Boolean(env.UPLOAD_KEY)
      }, 200, "*");
    }
    if (!allowedOrigin || reqOrigin !== allowedOrigin) {
      return sendJSON({ error: "Trang truy cập không được phép." }, 403);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": reqOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Upload-Key",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    if (request.method !== "POST" || new URL(request.url).pathname !== "/upload") {
      return sendJSON({ error: "Không tìm thấy đường dẫn." }, 404, reqOrigin);
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return sendJSON({ error: "Worker chưa cấu hình thông tin GitHub." }, 500, reqOrigin);
    }
    // Upload key KHONG được chèn vào index.html; chỉ lưu dưới dạng Secret trong Worker.
    if (env.UPLOAD_KEY && request.headers.get("X-Upload-Key") !== env.UPLOAD_KEY) {
      return sendJSON({ error: "Mã tải ảnh không đúng." }, 401, reqOrigin);
    }
    const length = Number(request.headers.get("Content-Length") || "0");
    if (length > MAX_IMAGE_SIZE + 128 * 1024) {
      return sendJSON({ error: "Ảnh vượt quá 8 MB." }, 413, reqOrigin);
    }
    try {
      const form = await request.formData();
      const photo = form.get("image");
      if (!photo || typeof photo.arrayBuffer !== "function") {
        return sendJSON({ error: "Không có tệp ảnh." }, 400, reqOrigin);
      }
      const kind = (photo.type || "").toLowerCase();
      const extension = EXTENSIONS[kind];
      if (!extension) return sendJSON({ error: "Chỉ chấp nhận JPG, PNG, WEBP, GIF, HEIC, HEIF, AVIF." }, 415, reqOrigin);
      if (photo.size < 1 || photo.size > MAX_IMAGE_SIZE) {
        return sendJSON({ error: "Ảnh rỗng hoặc vượt quá 8 MB." }, 413, reqOrigin);
      }
      const bytes = new Uint8Array(await photo.arrayBuffer());
      const signature = (s, start = 0) => [...s].every((char, j) => bytes[start + j] === char.charCodeAt(0));
      const isJpg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const isPng = bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
      const isWebp = signature("RIFF") && signature("WEBP", 8);
      const isGif = signature("GIF87a") || signature("GIF89a");
      const isIso = signature("ftyp", 4);
      const isImage = ({"image/jpeg": isJpg, "image/png": isPng, "image/webp": isWebp,
        "image/gif": isGif, "image/heic": isIso, "image/heif": isIso,
        "image/avif": isIso})[kind];
      if (!isImage) return sendJSON({ error: "Nội dung ảnh không hợp lệ." }, 415, reqOrigin);

      const date = new Date();
      const stamp = date.toISOString().replace(/[-:]/g, "").replace(/[.].*$/, "").replace("T", "-");
      const filename = `${stamp}-${crypto.randomUUID().slice(0, 12)}.${extension}`;
      const path = `uploads/${filename}`;
      const api = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
      const body = {
        message: `Upload photo ${filename}`,
        content: asBase64(bytes)
      };
      if (env.GITHUB_BRANCH) body.branch = env.GITHUB_BRANCH;
      const githubResponse = await fetch(api, {
        method: "PUT",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!githubResponse.ok) {
        // GitHub 403 co nhieu nguyen nhan: quyen, token khong dung, rate limit...
        // Tra ve message that cua GitHub (khong tra token, URL bi mat hay headers auth).
        let githubMessage = "Không có thông tin chi tiết từ GitHub";
        try {
          const errorBody = await githubResponse.json();
          if (typeof errorBody.message === "string") {
            githubMessage = errorBody.message.slice(0, 500);
          }
        } catch {}
        const remaining = githubResponse.headers.get("x-ratelimit-remaining");
        const retryAfter = githubResponse.headers.get("retry-after");
        const requestId = githubResponse.headers.get("x-github-request-id");
        console.warn("GitHub upload error", {
          status: githubResponse.status,
          message: githubMessage,
          requestId,
          remaining,
          retryAfter
        });
        let hint = "Kiểm tra Secret GITHUB_TOKEN trên Cloudflare (token vừa tạo phải được dán vào Worker).";
        if (/rate limit/i.test(githubMessage) || remaining === "0") {
          hint = "GitHub đang giới hạn API. Không thử liên tục; chờ hết thời hạn giới hạn rồi thử lại.";
        } else if (/not accessible|permission|forbidden|access denied/i.test(githubMessage)) {
          hint = "Kiểm tra token trong Cloudflare có phải token MỚI, Resource owner đúng và Contents: Read and write đã được lưu.";
        } else if (/protected branch|branch protection|repository rule/i.test(githubMessage)) {
          hint = "Nhánh mặc định có thể bị bảo vệ bởi quy tắc của repository.";
        }
        return sendJSON({
          error: `GitHub HTTP ${githubResponse.status}: ${githubMessage}. ${hint}`,
          github_status: githubResponse.status,
          github_message: githubMessage,
          github_request_id: requestId
        }, 502, reqOrigin);
      }
      return sendJSON({ ok: true, path }, 201, reqOrigin);
    } catch (error) {
      console.error("Upload error", error instanceof Error ? error.message : "unknown");
      return sendJSON({ error: "Có lỗi khi tải ảnh lên. Vui lòng thử lại." }, 500, reqOrigin);
    }
  }
};
