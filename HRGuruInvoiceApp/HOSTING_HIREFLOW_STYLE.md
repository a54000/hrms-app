# Hosting Like HireFlow

This invoice app can be hosted the same way as the HireFlow app: keep the Flask app running locally with Waitress, then expose it through Cloudflare Tunnel.

## 1. Set a Login

Open PowerShell in this folder and set credentials before starting the hosted app:

```powershell
$env:INVOICE_APP_USERNAME = "admin"
$env:INVOICE_APP_PASSWORD = "use-a-strong-password"
```

The app only requires this login when both variables are set. Keep them set for any public hosting.

## 2. Start the App

Run:

```powershell
.\start_hosted_app.bat
```

The starter will use a local `.venv` or `venv` if present. On this server it can also fall back to the working HireFlow Python runtime at `D:\hrguru-ats\venv\Scripts\python.exe`.

By default it serves the app at:

```text
http://127.0.0.1:5055
```

To use a different port:

```powershell
$env:PORT = "5056"
.\start_hosted_app.bat
```

## 3. Start Cloudflare Tunnel

In another PowerShell window, run:

```powershell
.\start_cloudflare_tunnel.bat
```

This uses the same `cloudflared.exe` already present in `D:\hrguru-ats`. Cloudflare will print a public URL. Open that URL from anywhere and sign in with the username and password from step 1.

## Notes

- New invoice PDFs are saved by default in `D:\HRGURU\Invoices\Invoices`. You can override this with `INVOICE_OUTPUT_DIR`.
- Keep `D:\HRGURU\Invoices\Invoices`, `invoice_mis.json`, `invoice_references.json`, and `invoice_clients.json` backed up because the app stores invoice data there.
- Do not run the public app with Flask debug mode enabled.
- For a permanent branded URL, create a named Cloudflare Tunnel and route a subdomain such as `invoice.hrgp.in` to `http://127.0.0.1:5055`.
