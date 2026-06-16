# HireFlow Integration

The invoice app now exposes a Flask blueprint named `invoice_bp`, so HireFlow can mount it under the existing HireFlow login and Cloudflare/domain. The route should be admin-only.

## Recommended URL

```text
https://hireflow.hrgp.in/invoices/
```

## HireFlow `app.py` Patch

Add this after `login_required` is defined in `D:\hrguru-ats\app.py`:

```python
def register_invoice_app():
    invoice_app_dir = os.getenv("INVOICE_APP_DIR", r"D:\HRGuruInvoiceApp")
    if invoice_app_dir not in sys.path:
        sys.path.insert(0, invoice_app_dir)

    from invoice_web_app import invoice_bp

    @invoice_bp.before_request
    def require_invoice_admin():
        if not session.get("logged_in"):
            return redirect(url_for("login_page"))
        if not session.get("is_admin"):
            return "Admin access required.", 403

    app.register_blueprint(invoice_bp, url_prefix="/invoices")


register_invoice_app()
```

This reuses HireFlow's session and blocks non-admin users even if they manually enter `/invoices/`. Do not set `INVOICE_APP_USERNAME` or `INVOICE_APP_PASSWORD` for this mode; those are only for the standalone public app.

## HireFlow Navigation Patch

In `D:\hrguru-ats\templates\index.html`, add this inside the top navigation near the other `.topnav-link` buttons:

```html
<button class="topnav-link admin-only" data-top-tab="invoices" onclick="window.location.href='/invoices/'">Invoices</button>
```

The existing HireFlow admin UI logic shows `.admin-only` items only for admin users.

## Data Location

Invoice data will continue to live in:

```text
D:\HRGuruInvoiceApp
```

Back up these files/folders:

```text
generated_invoices
invoice_mis.json
invoice_references.json
invoice_clients.json
Invoice_MIS_Export.xlsx
```

## Verification

After restarting HireFlow, open:

```text
https://hireflow.hrgp.in/invoices/
```

Expected behavior:

- Not signed in: redirects to `/login`.
- Signed in as recruiter/non-admin: returns `403 Admin access required.`
- Signed in as admin: loads the invoice generator without a second password prompt.
