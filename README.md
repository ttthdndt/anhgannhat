# Website chạm bất kỳ đâu để tải ảnh lên GitHub

**Giao diện**: Mở trang → chạm bất cứ đâu → chọn 1 ảnh → ảnh lưu vào thư mục `uploads/` của repository GitHub. Tên ảnh tự tạo, không ghi đè.

> GitHub Pages chỉ chứa website tĩnh, không tự nhận file upload. Vì vậy bản này dùng **Cloudflare Worker** để giữ GitHub token bí mật và lưu ảnh qua GitHub API. Không đặt token vào `index.html` hoặc công khai trên GitHub.

## 1. Tạo repo GitHub

1. Vào https://github.com/new → tạo repository, ví dụ `photo-upload`, chọn **Public** (để bật GitHub Pages đơn giản).
2. Tải `index.html` và `worker.js` của bộ mã nguồn này lên repo.
3. Trong **Settings → Pages**, chọn **Deploy from a branch**, branch `main`, folder `/(root)`, rồi Save.
4. Trang có dạng `https://TEN_USER.github.io/photo-upload/` (cần chờ GitHub Pages publish).

## 2. Tạo GitHub token

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access** → chọn đúng repository `photo-upload`.
3. **Repository permissions → Contents** → chọn **Read and write**.
4. Tạo token, sao chép và giữ kín. Token chỉ cần quyền ghi Contents của repo này.

## 3. Tạo Cloudflare Worker

1. Vào https://dash.cloudflare.com/ → **Workers & Pages** → tạo Worker mới; đặt tên, ví dụ `photo-uploader`.
2. Mở **Edit code** của Worker, thay toàn bộ nội dung bằng file `worker.js`, sau đó **Deploy**.
3. Trong Worker → **Settings → Variables and Secrets**, thêm:

   | Tên | Giá trị | Loại |
   | --- | --- | --- |
   | `GITHUB_TOKEN` | Token tạo ở bước 2 | **Secret** |
   | `GITHUB_OWNER` | Tên tài khoản GitHub của bạn | Text |
   | `GITHUB_REPO` | `photo-upload` (hoặc tên repo bạn chọn) | Text |
   | `ALLOWED_ORIGIN` | `https://TEN_USER.github.io` (không có `/photo-upload/` ở cuối) | Text |
   | `UPLOAD_KEY` | Mật mã tự đặt để không ai tự ý upload | **Secret**, rất nên đặt |

   Nếu muốn lưu vào branch khác branch mặc định, thêm `GITHUB_BRANCH` (Text). Triển khai lại Worker sau khi chỉnh biến nếu Dashboard yêu cầu.

4. Sao chép Worker URL, ví dụ `https://photo-uploader.xxxxx.workers.dev`.

## 4. Nối website với Worker

Mở `index.html` trong GitHub → **Edit**, tìm dòng:

```js
const WORKER_URL = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";
```

Thay bằng URL Worker thật (không thêm `/upload`), sau đó **Commit changes**. Mở lại GitHub Pages khi bản mới đã publish.

## 5. Dùng

- Mở trang bằng điện thoại/máy tính → **chạm bất kỳ chỗ nào** → chọn ảnh.
- Nếu đã thiết lập `UPLOAD_KEY`, lần đầu upload trên trình duyệt sẽ hỏi mật mã. Sau khi upload đúng, trình duyệt ghi nhớ mã trên thiết bị đó, các lần sau chỉ chạm và chọn ảnh.
- Ảnh được tạo tại **repo → `uploads/`**, ví dụ `uploads/20261112-171500-a1b2c3d4e5f6.jpg`.
- Hỗ trợ JPG, PNG, WEBP, GIF, HEIC, HEIF, AVIF; tối đa 8 MB/ảnh.

## Lưu ý

- **Repo Public thì ảnh đã upload có thể xem công khai**, không thích hợp cho ảnh riêng tư. Có thể dùng repo riêng (Private) để giữ kín ảnh; phần triển khai GitHub Pages lúc đó tùy điều kiện tài khoản.
- `ALLOWED_ORIGIN` chỉ giới hạn trình duyệt nào được phép kết nối, **không thay thế được mật mã**. Nên thiết lập `UPLOAD_KEY`, không gửi mật mã cho người lạ.
- Mật mã được nhớ bằng `localStorage` trong trình duyệt. Trên máy dùng chung, không nên lưu mã trong trình duyệt hoặc hãy xóa dữ liệu website khi dùng xong.
- Mỗi lần upload tạo một commit trên GitHub, nên phù hợp số lượng ảnh nhỏ, không dành cho lưu trữ ảnh dung lượng lớn/hàng nghìn ảnh mỗi ngày.
- Nếu cần upload ảnh trên iPhone, có thể chọn HEIC. Một số ảnh HEIC/AVIF định dạng đặc biệt có thể bị từ chối kiểm tra chữ ký định dạng.
