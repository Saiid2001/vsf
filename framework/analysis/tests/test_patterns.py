import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import prefilter

def test_blocklists():
    
    URLS = [
        "https://prebid-server.h5v.eu/openrtb2/auction",
        "https://tagging.immoweb.be/g/collect",
        "https://www.facebook.com/privacy_sandbox/pixel/register/trigger/",
        "https://www.tchibo.de/service/sst-tg/g/collect"
    ]


    for url in URLS:
        assert prefilter.ADBLOCKER.check_network_urls(
            url,
            source_url="https://example.com",
            request_type="",
        )
