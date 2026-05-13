/**
 * WFilmizle - Nuvio Provider (HDPlayerSystem Nuvio Fix)
 * Kaynak: https://www.wfilmizle.bar
 * Yazar: ByAyzen (CS3) → Nuvio portlanması
 */

var BASE_URL = "https://www.wfilmizle.bar";
var TMDB_API_KEY = "314ea98913199aa268f4b0151b29994a"; 

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
  "Referer": BASE_URL
};

function getTmdbTitle(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR";
  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      return (data.title || data.name || data.original_title || data.original_name || null);
    });
}

function searchSite(title) {
  var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
  console.log("[WFilmizle] Aranıyor: " + searchUrl);

  return fetch(searchUrl, { headers: HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var patterns = [
        /href="(https?:\/\/(?:www\.)?wfilmizle\.bar\/[^"#?]+izle[^"#?]*\/)"/gi,
        /href="(https?:\/\/(?:www\.)?wfilmizle\.bar\/[^"#?]+-izle[^"#?]*\/)"/gi,
        /<h\d[^>]*>\s*<a href="(https?:\/\/(?:www\.)?wfilmizle\.bar\/[^"]+)"[^>]*>/gi,
      ];
      for (var p = 0; p < patterns.length; p++) {
        var match = patterns[p].exec(html);
        if (match && match[1]) {
          console.log("[WFilmizle] Bulundu: " + match[1]);
          return match[1];
        }
      }
      return null;
    });
}

function extractFromPage(pageUrl) {
  console.log("[WFilmizle] Sayfa çekiliyor: " + pageUrl);

  return fetch(pageUrl, { headers: HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var streams = [];

      var iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var iMatch;
      while ((iMatch = iframeRegex.exec(html)) !== null) {
        var src = iMatch[1].trim();
        if (src.indexOf("google") === -1 && src.indexOf("facebook") === -1 && src.indexOf("youtube") === -1 && src.length > 20) {
          streams.push({
            name: "WFilmizle",
            title: "WHDPlayer",
            url: src,
            quality: "HD",
            headers: { Referer: BASE_URL }
          });
        }
      }

      var m3u8Regex = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi;
      var mMatch;
      while ((mMatch = m3u8Regex.exec(html)) !== null) {
        streams.push({
          name: "WFilmizle",
          title: "HD Stream",
          url: mMatch[1],
          quality: "HD",
          headers: { Referer: BASE_URL }
        });
      }

      var seen = {};
      return streams.filter(function (s) {
        if (seen[s.url]) return false;
        seen[s.url] = true;
        return true;
      });
    });
}

// İŞTE NUVIO'YA UYGUN YAZILMIŞ YENİ İFRAME ÇÖZÜCÜ
function resolveIframeStream(iframeUrl, referer) {
  if (iframeUrl.indexOf("hdplayersystem.com") !== -1) {
    console.log("[WFilmizle] HDPlayer API'si çözümleniyor: " + iframeUrl);
    
    var urlParts = iframeUrl.split('/');
    var videoId = urlParts[urlParts.length - 1]; 

    if (!videoId) return Promise.resolve([]);

    var apiUrl = "https://hdplayersystem.com/player/index.php?data=" + videoId + "&do=getVideo";
    
    return fetch(apiUrl, {
      method: 'GET',
      headers: {
        "Referer": iframeUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": HEADERS["User-Agent"]
      }
    })
    .then(function(res) { 
        // Nuvio'da direkt .json() bazen hata verir, metin olarak alıyoruz
        return res.text(); 
    })
    .then(function(text) {
      try {
        var apiData = JSON.parse(text);
        if (apiData && apiData.securedLink) {
          console.log("[WFilmizle] Şifreli m3u8 linki bulundu!");
          return [{
            name: "WFilmizle",
            title: "HD (HLS)",
            url: apiData.securedLink,
            quality: "HD",
            // Nuvio bu formatı bekler
            headers: { Referer: iframeUrl } 
          }];
        }
      } catch(e) {
        console.log("[WFilmizle] JSON Parse Hatası: " + e.message);
      }
      return [];
    })
    .catch(function(err) {
      console.log("[WFilmizle] HDPlayer API hatası: " + err.message);
      return [];
    });
  }

  // Diğer iframe türleri için fallback
  return fetch(iframeUrl, {
    headers: {
      "User-Agent": HEADERS["User-Agent"],
      "Referer": referer || BASE_URL
    }
  })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var found = [];
      var m3u8Regex = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi;
      var mMatch;
      while ((mMatch = m3u8Regex.exec(html)) !== null) {
        found.push({
          name: "WFilmizle",
          title: "Alternatif",
          url: mMatch[1],
          quality: "HD",
          headers: { Referer: iframeUrl }
        });
      }
      return found;
    })
    .catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!TMDB_API_KEY) return Promise.resolve([]);

  return getTmdbTitle(tmdbId, mediaType)
    .then(function (title) {
      if (!title) return [];
      return searchSite(title);
    })
    .then(function (filmUrl) {
      if (!filmUrl) return [];
      return extractFromPage(filmUrl).then(function (streams) {
        
        var iframeStreams = streams.filter(function (s) {
          return s.url.indexOf(".m3u8") === -1 && s.url.indexOf(".mp4") === -1 && s.url.indexOf("http") === 0;
        });

        if (iframeStreams.length > 0) {
          var resolvePromises = iframeStreams.map(function (s) {
            return resolveIframeStream(s.url, filmUrl);
          });

          return Promise.all(resolvePromises).then(function (results) {
            var resolved = [];
            results.forEach(function (r) { resolved = resolved.concat(r); });
            return resolved.length > 0 ? resolved : streams;
          });
        }
        return streams;
      });
    })
    .catch(function () { return []; });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
