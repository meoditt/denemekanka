/**
 * WFilmizle - Nuvio Provider (TAM SÜRÜM + HATA TEŞHİSİ + 404 FIX)
 */

var BASE_URL = "https://www.wfilmizle.bar";
var TMDB_API_KEY = "314ea98913199aa268f4b0151b29994a"; 

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
  "Referer": BASE_URL
};

// Hataları ekrana "sahte kaynak" olarak basmak için yardımcı fonksiyon
function hataBas(mesaj) {
  return [{ name: "BİLGİ/HATA", title: mesaj, url: "http://127.0.0.1/hata.mp4", quality: "SD" }];
}

function getTmdbTitle(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR";
  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      return (data.title || data.name || data.original_title || data.original_name || null);
    })
    .catch(function(e) { return null; });
}

function searchSite(title) {
  var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
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
          return match[1];
        }
      }
      return null;
    })
    .catch(function() { return null; });
}

function extractFromPage(pageUrl) {
  return fetch(pageUrl, { headers: HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var streams = [];
      
      // 1. İframeleri Topla
      var iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var iMatch;
      while ((iMatch = iframeRegex.exec(html)) !== null) {
        var src = iMatch[1].trim();
        if (src.indexOf("google") === -1 && src.indexOf("youtube") === -1 && src.length > 20) {
          streams.push({ type: "iframe", url: src });
        }
      }

      // 2. Direkt m3u8 varsa Topla (Orijinal kodundaki gibi)
      var m3u8Regex = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi;
      var mMatch;
      while ((mMatch = m3u8Regex.exec(html)) !== null) {
        streams.push({ type: "direct", url: mMatch[1] });
      }

      return streams;
    })
    .catch(function(e) { return []; });
}

function resolveStream(sObj) {
  // Eğer direkt m3u8 bulduysa API ile uğraşmadan hemen ver
  if (sObj.type === "direct") {
    return Promise.resolve([{ name: "WFilmizle", title: "Alternatif (Direkt m3u8)", url: sObj.url, quality: "HD" }]);
  }

  var iframeUrl = sObj.url;

  // HDPlayer API Çözümleme ve 404 Nuvio Bypass
  if (iframeUrl.indexOf("hdplayersystem.com") !== -1) {
    var match = iframeUrl.match(/\/video\/([a-zA-Z0-9]+)/);
    var videoId = match ? match[1] : null;

    if (!videoId) return Promise.resolve(hataBas("HDPlayer ID Kesilemedi: " + iframeUrl));

    var apiUrl = "https://hdplayersystem.com/player/index.php?data=" + videoId + "&do=getVideo";
    
    return fetch(apiUrl, {
      method: 'GET',
      headers: {
        "Referer": iframeUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": HEADERS["User-Agent"]
      }
    })
    .then(function(res) { return res.text(); })
    .then(function(text) {
      try {
        var apiData = JSON.parse(text);
        if (apiData && apiData.securedLink) {
          // NUVIO 404 BYPASS TRICK BURADA:
          var cloudstreamFormattedUrl = apiData.securedLink + "|Referer=https://hdplayersystem.com/&Origin=https://hdplayersystem.com/&User-Agent=" + encodeURIComponent(HEADERS["User-Agent"]);
          
          return [{
            name: "WFilmizle",
            title: "HDPlayer (HLS Oynat)",
            url: cloudstreamFormattedUrl, 
            quality: "HD"
          }];
        }
        return hataBas("HDPlayer JSON içinde link bulunamadı!");
      } catch(e) {
        return hataBas("HDPlayer API Engeli (JSON Bozuk): " + text.substring(0, 25));
      }
    })
    .catch(function(err) {
      return hataBas("HDPlayer API'ye ulaşılamadı.");
    });
  }

  // Başka bir player iframe'i ise direkt linkini ver
  return Promise.resolve([{ name: "WFilmizle", title: "Diğer İframe (Oynatmayabilir)", url: iframeUrl, quality: "SD" }]);
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!TMDB_API_KEY) return Promise.resolve(hataBas("HATA: TMDB Key Eksik!"));

  return getTmdbTitle(tmdbId, mediaType)
    .then(function (title) {
      if (!title) return hataBas("HATA: TMDB'den ("+tmdbId+") isim çekilemedi!");
      
      return searchSite(title).then(function(filmUrl) {
         return { title: title, url: filmUrl };
      });
    })
    .then(function (data) {
      if (!data.url) return hataBas("HATA: '" + data.title + "' Wfilmizle sitesinde bulunamadı!");
      
      return extractFromPage(data.url).then(function (rawStreams) {
        if (rawStreams.length === 0) return hataBas("HATA: '" + data.title + "' sayfasında video/iframe bulunamadı!");

        var resolvePromises = rawStreams.map(function (s) {
          return resolveStream(s);
        });

        return Promise.all(resolvePromises).then(function (results) {
          var resolved = [];
          results.forEach(function (r) { resolved = resolved.concat(r); });
          return resolved;
        });
      });
    })
    .catch(function (err) { return hataBas("SİSTEM ÇÖKTÜ: " + err.message); });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
