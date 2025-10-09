from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import requests
import logging

TARGET_BASE = 'http://localhost:4000'
LISTEN_HOST = '127.0.0.1'
LISTEN_PORT = 5000

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('proxy')

app = Flask(__name__)
# enable CORS for all routes and origins
CORS(app, resources={r"/*": {"origins": "*"}})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'proxy_to': TARGET_BASE})


@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
def proxy(path):
    # Build target URL preserving the path and query string
    target_url = f"{TARGET_BASE}/{path}" if path else TARGET_BASE + '/'
    logger.info('Proxying %s %s -> %s', request.method, request.path, target_url)

    # Copy headers but remove Host and encoding headers that would confuse the target
    excluded_req_headers = {'host', 'content-length', 'accept-encoding', 'connection'}
    forward_headers = {k: v for k, v in request.headers.items() if k.lower() not in excluded_req_headers}

    # Forward query params and body
    params = request.args.to_dict(flat=False)
    data = request.get_data() or None

    try:
        upstream = requests.request(
            method=request.method,
            url=target_url,
            headers=forward_headers,
            params=params,
            data=data,
            stream=True,
            timeout=60,
        )
    except requests.RequestException as e:
        logger.exception('Upstream request failed')
        return Response(str(e), status=502)

    # Stream the response back to the client
    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    # Strip hop-by-hop headers
    hop_by_hop = {'transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade', 'content-encoding', 'content-length'}
    response_headers = [(name, value) for name, value in upstream.headers.items() if name.lower() not in hop_by_hop]

    return Response(generate(), status=upstream.status_code, headers=response_headers)


if __name__ == '__main__':
    logger.info('Starting proxy on %s:%d -> %s', LISTEN_HOST, LISTEN_PORT, TARGET_BASE)
    # Use threaded=True so that streaming works smoothly for multiple clients
    app.run(host=LISTEN_HOST, port=LISTEN_PORT, threaded=True)
