// ===== 공용 XSS 방어 도우미 (가장 먼저 로드되어야 함) =====
// escHtml: 사용자 입력을 innerHTML 템플릿에 넣을 때 반드시 감싸기 (텍스트/속성 모두 안전)
function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"'`]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c];
    });
}

// safeImgUrl: 앱이 직접 만든 base64 이미지(data:image/...)만 통과, 그 외(외부 URL, 따옴표 주입 등)는 ''
function safeImgUrl(u) {
    if (typeof u !== 'string') return '';
    return /^data:image\/(png|jpeg|jpg|webp|gif|avif|bmp);base64,[A-Za-z0-9+\/=]+$/.test(u) ? u : '';
}
