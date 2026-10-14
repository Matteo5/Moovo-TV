package tv.moovo.app;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Client WebView de Capacitor, complété par le proxy natif /api/proxy. */
public class ProxyWebViewClient extends BridgeWebViewClient {

    public ProxyWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        // Appelé hors du fil principal : la requête réseau bloquante est autorisée ici
        if (NativeProxy.isProxyRequest(request.getUrl())) {
            return NativeProxy.handle(request);
        }
        return super.shouldInterceptRequest(view, request);
    }
}
