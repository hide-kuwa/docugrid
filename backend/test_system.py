import json
import mimetypes
import sys
import uuid
from http.client import HTTPConnection

HOST = "localhost"
PORT = 3100
DEFAULT_HEADERS = {
    "X-Docugrid-Role": "admin",
}

MINIMAL_PDF_BYTES = (
    b"%PDF-1.4\n"
    b"%\xe2\xe3\xcf\xd3\n"
    b"1 0 obj\n"
    b"<< /Type /Catalog /Pages 2 0 R >>\n"
    b"endobj\n"
    b"2 0 obj\n"
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n"
    b"endobj\n"
    b"3 0 obj\n"
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\n"
    b"endobj\n"
    b"4 0 obj\n"
    b"<< /Length 42 >>\n"
    b"stream\n"
    b"BT /F1 24 Tf 50 150 Td (Hello World) Tj ET\n"
    b"endstream\n"
    b"endobj\n"
    b"5 0 obj\n"
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n"
    b"endobj\n"
    b"xref\n"
    b"0 6\n"
    b"0000000000 65535 f \n"
    b"0000000015 00000 n \n"
    b"0000000064 00000 n \n"
    b"0000000121 00000 n \n"
    b"0000000247 00000 n \n"
    b"0000000339 00000 n \n"
    b"trailer\n"
    b"<< /Size 6 /Root 1 0 R >>\n"
    b"startxref\n"
    b"409\n"
    b"%%EOF\n"
)


def print_pass(name: str) -> None:
    print(f"[PASS] {name}")


def print_fail(name: str, error: Exception | str) -> None:
    print(f"[FAIL] {name}: {error}")


def send_multipart_request(
    method: str, endpoint: str, fields: dict, files: list, extra_headers: dict | None = None
) -> tuple:
    boundary = uuid.uuid4().hex
    body_parts: list[bytes] = []

    for name, value in fields.items():
        body_parts.append(
            (
                f"--{boundary}\r\n"
                f"Content-Disposition: form-data; name=\"{name}\"\r\n\r\n"
                f"{value}\r\n"
            ).encode("utf-8")
        )

    for field_name, filename, content_type, data in files:
        body_parts.append(
            (
                f"--{boundary}\r\n"
                f"Content-Disposition: form-data; name=\"{field_name}\"; filename=\"{filename}\"\r\n"
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode("utf-8")
        )
        body_parts.append(data)
        body_parts.append(b"\r\n")

    body_parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(body_parts)

    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
        **DEFAULT_HEADERS,
    }
    if extra_headers:
        headers.update(extra_headers)

    connection = HTTPConnection(HOST, PORT, timeout=30)
    try:
        connection.request(method, endpoint, body=body, headers=headers)
        response = connection.getresponse()
        response_body = response.read()
        return response.status, dict(response.getheaders()), response_body
    finally:
        connection.close()


def send_basic_request(method: str, endpoint: str, extra_headers: dict | None = None) -> tuple:
    connection = HTTPConnection(HOST, PORT, timeout=10)
    try:
        headers = {**DEFAULT_HEADERS}
        if extra_headers:
            headers.update(extra_headers)
        connection.request(method, endpoint, headers=headers)
        response = connection.getresponse()
        response_body = response.read()
        return response.status, dict(response.getheaders()), response_body
    finally:
        connection.close()


def send_json_post(endpoint: str, body: dict) -> tuple:
    connection = HTTPConnection(HOST, PORT, timeout=10)
    try:
        payload = json.dumps(body).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(payload)),
        }
        connection.request("POST", endpoint, body=payload, headers=headers)
        response = connection.getresponse()
        response_body = response.read()
        return response.status, dict(response.getheaders()), response_body
    finally:
        connection.close()


def send_request_with_headers(method: str, endpoint: str, headers: dict) -> tuple:
    connection = HTTPConnection(HOST, PORT, timeout=10)
    try:
        connection.request(method, endpoint, headers=headers)
        response = connection.getresponse()
        response_body = response.read()
        return response.status, dict(response.getheaders()), response_body
    finally:
        connection.close()


def assert_status(
    test_name: str, status: int, expected: int, body: bytes, allow_body_contains: str | None = None
) -> None:
    if status != expected:
        raise RuntimeError(
            f"{test_name} expected {expected}, got {status}. body={decode_body(body)}"
        )
    if allow_body_contains and allow_body_contains not in decode_body(body):
        raise RuntimeError(
            f"{test_name} body does not contain '{allow_body_contains}'. body={decode_body(body)}"
        )


def decode_body(body: bytes) -> str:
    return body.decode("utf-8", errors="replace")


def main() -> int:
    try:
        status, _, body = send_basic_request("GET", "/openapi.json")
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 1: Health Check")
    except Exception as exc:
        print_fail("Test 1: Health Check", exc)
        return 1

    try:
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/pdf/info",
            {},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 2: PDF Info")
    except Exception as exc:
        print_fail("Test 2: PDF Info", exc)
        return 1

    try:
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/highlight",
            {
                "page": 0,
                "x": 0.1,
                "y": 0.1,
                "w": 0.2,
                "h": 0.1,
                "type": "box",
            },
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 3: PDF Highlight")
    except Exception as exc:
        print_fail("Test 3: PDF Highlight", exc)
        return 1

    try:
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/edit/reorder",
            {"order": "0"},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 4: PDF Reorder")
    except Exception as exc:
        print_fail("Test 4: PDF Reorder", exc)
        return 1

    try:
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/pdf/thumbnails",
            {},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 5: PDF Thumbnails")
    except Exception as exc:
        print_fail("Test 5: PDF Thumbnails", exc)
        return 1

    try:
        pdf_filename = "a.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/edit/merge",
            {},
            [
                ("files", pdf_filename, pdf_type, MINIMAL_PDF_BYTES),
                ("files", "b.pdf", pdf_type, MINIMAL_PDF_BYTES),
            ],
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 6: PDF Merge")
    except Exception as exc:
        print_fail("Test 6: PDF Merge", exc)
        return 1

    try:
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/pdf/render",
            {"page": "0"},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 7: PDF Render")
    except Exception as exc:
        print_fail("Test 7: PDF Render", exc)
        return 1

    try:
        status, _, body = send_basic_request("GET", "/api/audit-events?limit=5")
        if status != 200:
            raise RuntimeError(decode_body(body))
        print_pass("Test 8: Audit Events List")
    except Exception as exc:
        print_fail("Test 8: Audit Events List", exc)
        return 1

    try:
        status, _, body = send_json_post(
            "/api/auth/login",
            {"email": "smoke@test.local", "password": "password", "stakeholder_id": "actor-admin"},
        )
        if status != 200:
            raise RuntimeError(decode_body(body))
        data = json.loads(body.decode("utf-8"))
        token = data.get("access_token")
        if not token:
            raise RuntimeError("missing access_token")
        status2, _, body2 = send_request_with_headers(
            "GET",
            "/api/auth/me",
            {"Authorization": f"Bearer {token}"},
        )
        if status2 != 200:
            raise RuntimeError(decode_body(body2))
        me = json.loads(body2.decode("utf-8"))
        if me.get("role") != "admin":
            raise RuntimeError(f"unexpected role: {me}")
        print_pass("Test 9: JWT Login and /auth/me")
    except Exception as exc:
        print_fail("Test 9: JWT Login and /auth/me", exc)
        return 1

    try:
        # Viewer cannot upload (requires document.upload)
        viewer_headers = {
            "X-Docugrid-Role": "viewer",
            "X-Docugrid-Stakeholder": "actor-c1",
            "X-Docugrid-Client": "c1",
            "X-Docugrid-User": "viewer@test.local",
        }
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/pdf/info",
            {},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
            extra_headers=viewer_headers,
        )
        assert_status("viewer upload denied", status, 403, body, "Permission denied: document.upload")
        print_pass("Test 10: viewer cannot upload")
    except Exception as exc:
        print_fail("Test 10: viewer cannot upload", exc)
        return 1

    try:
        # Operator can upload within scope
        operator_headers = {
            "X-Docugrid-Role": "operator",
            "X-Docugrid-Stakeholder": "actor-s1",
            "X-Docugrid-Client": "c1",
            "X-Docugrid-User": "operator@test.local",
        }
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/pdf/info",
            {},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
            extra_headers=operator_headers,
        )
        assert_status("operator upload allowed", status, 200, body)
        print_pass("Test 11: operator can upload")
    except Exception as exc:
        print_fail("Test 11: operator can upload", exc)
        return 1

    try:
        # Operator cannot access out-of-scope client
        out_scope_headers = {
            "X-Docugrid-Role": "operator",
            "X-Docugrid-Stakeholder": "actor-s1",
            "X-Docugrid-Client": "c5",
            "X-Docugrid-User": "operator@test.local",
        }
        status, _, body = send_basic_request("GET", "/files", extra_headers=out_scope_headers)
        assert_status("operator out-of-scope denied", status, 403, body, "Client scope denied")
        print_pass("Test 12: operator out-of-scope denied")
    except Exception as exc:
        print_fail("Test 12: operator out-of-scope denied", exc)
        return 1

    try:
        # Approver cannot upload (no document.upload)
        approver_headers = {
            "X-Docugrid-Role": "approver",
            "X-Docugrid-Stakeholder": "actor-s3",
            "X-Docugrid-Client": "c1",
            "X-Docugrid-User": "approver@test.local",
        }
        pdf_filename = "test.pdf"
        pdf_type = mimetypes.guess_type(pdf_filename)[0] or "application/pdf"
        status, _, body = send_multipart_request(
            "POST",
            "/api/pdf/info",
            {},
            [("file", pdf_filename, pdf_type, MINIMAL_PDF_BYTES)],
            extra_headers=approver_headers,
        )
        assert_status("approver upload denied", status, 403, body, "Permission denied: document.upload")
        print_pass("Test 13: approver cannot upload")
    except Exception as exc:
        print_fail("Test 13: approver cannot upload", exc)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
