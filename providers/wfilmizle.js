/**
 * WFilmizle - Nuvio Provider
 * Kaynak: https://www.wfilmizle.bar
 * Yazar: ByAyzen (CS3) → Nuvio portlanması
 *
 * NOT: TMDB_API_KEY değişkenine kendi API anahtarını gir.
 * Ücretsiz al: https://www.themoviedb.org/settings/api
 */

var BASE_URL = "https://www.wfilmizle.bar";
var TMDB_API_KEY = "314ea98913199aa268f4b0151b29994a"; // <-- Buraya kendi TMDB API key'ini yaz

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
  "Referer": BASE_URL
};

// ─────────────────────────────────────────────
// TMDB'den film başlığını al (Türkçe öncelikli)
// ─────────────────────────────────────────────
function getTmdbTitle(tmdbId, mediaType) {
  var url =
    "https://api.themoviedb.org/3/" +
    mediaType +
    "/" +
    tmdbId +
    "?api_key=" +
    TMDB_API_KEY +
    "&language=tr-TR";

  return fetch(url)
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      // Türkçe başlık → orijinal başlık sıralaması
      return (
        data.title ||
        data.name ||
        data.original_title ||
        data.original_name ||
        null
      );
    });
}

// ─────────────────────────────────────────────
// Sitede ara, ilk film sayfasının URL'ini döndür
// ─────────────────────────────────────────────
function searchSite(title) {
  var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
  console.log("[WFilmizle] Aranıyor: " + searchUrl);

  return fetch(searchUrl, { headers: HEADERS })
    .then(function (res) {
      return res.text();
    })
    .then(function (html) {
      // Arama sonuçlarındaki film linkleri genellikle bu pattern'e uyar:
      // <a href="https://www.wfilmizle.bar/xyz-izle/">
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

      console.log("[WFilmizle] Sonuç bulunamadı: " + title);
      return null;
    });
}

// ─────────────────────────────────────────────
// Film sayfasını çek ve stream URL'lerini ayıkla
// ─────────────────────────────────────────────
function extractFromPage(pageUrl) {
  console.log("[WFilmizle] Sayfa çekiliyor: " + pageUrl);

  return fetch(pageUrl, { headers: HEADERS })
    .then(function (res) {
      return res.text();
    })
    .then(function (html) {
      var streams = [];

      // ── 1. iframe src ──────────────────────────────────────────────────
      // WHDPlayer ve benzeri playerlar genellikle iframe ile gömülür
      var iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var iMatch;
      while ((iMatch = iframeRegex.exec(html)) !== null) {
        var src = iMatch[1].trim();
        // Google/Facebook/YouTube iframe'leri atla
        if (
          src.indexOf("google") === -1 &&
          src.indexOf("facebook") === -1 &&
          src.indexOf("youtube") === -1 &&
          src.indexOf("disqus") === -1 &&
          src.length > 20
        ) {
          console.log("[WFilmizle] iframe bulundu: " + src);
          streams.push({
            name: "WFilmizle",
            title: "WHDPlayer",
            url: src,
            quality: "HD",
            headers: { Referer: BASE_URL }
          });
        }
      }

      // ── 2. Direkt m3u8 ────────────────────────────────────────────────
      var m3u8Regex = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi;
      var mMatch;
      while ((mMatch = m3u8Regex.exec(html)) !== null) {
        console.log("[WFilmizle] m3u8 bulundu: " + mMatch[1]);
        streams.push({
          name: "WFilmizle",
          title: "HD Stream",
          url: mMatch[1],
          quality: "HD",
          headers: { Referer: BASE_URL }
        });
      }

      // ── 3. JWPlayer / video.js file: ──────────────────────────────────
      var jwRegex = /file\s*:\s*["']([^"']+)["']/gi;
      var jMatch;
      while ((jMatch = jwRegex.exec(html)) !== null) {
        var fileUrl = jMatch[1];
        if (
          fileUrl.indexOf("m3u8") !== -1 ||
          fileUrl.indexOf(".mp4") !== -1 ||
          fileUrl.indexOf("stream") !== -1
        ) {
          console.log("[WFilmizle] JW file bulundu: " + fileUrl);
          streams.push({
            name: "WFilmizle",
            title: "JWPlayer",
            url: fileUrl,
            quality: "HD",
            headers: { Referer: BASE_URL }
          });
        }
      }

      // ── 4. videoUrl / source değişkeni ────────────────────────────────
      var srcVarRegex = /(?:videoUrl|source|src|hlsUrl)\s*[=:]\s*["']([^"']+)["']/gi;
      var sMatch;
      while ((sMatch = srcVarRegex.exec(html)) !== null) {
        var u = sMatch[1];
        if (u.indexOf("http") === 0 && (u.indexOf("m3u8") !== -1 || u.indexOf(".mp4") !== -1)) {
          console.log("[WFilmizle] video değişken bulundu: " + u);
          streams.push({
            name: "WFilmizle",
            title: "Video",
            url: u,
            quality: "HD",
            headers: { Referer: BASE_URL }
          });
        }
      }

      // ── 5. data-video / data-src ───────────────────────────────────────
      var dataRegex = /data-(?:video|src|url)=["']([^"']+)["']/gi;
      var dMatch;
      while ((dMatch = dataRegex.exec(html)) !== null) {
        var du = dMatch[1];
        if (du.indexOf("http") === 0) {
          console.log("[WFilmizle] data attr bulundu: " + du);
          streams.push({
            name: "WFilmizle",
            title: "DataSrc",
            url: du,
            quality: "HD",
            headers: { Referer: BASE_URL }
          });
        }
      }

      // Aynı URL'leri tekrarlama
      var seen = {};
      var unique = streams.filter(function (s) {
        if (seen[s.url]) return false;
        seen[s.url] = true;
        return true;
      });

      console.log("[WFilmizle] Toplam " + unique.length + " stream bulundu.");
      return unique;
    });
}

// ─────────────────────────────────────────────
// İframe URL'sine gidip içinden stream çek
// (iframe player kendi HTML'inde m3u8 tutuyorsa)
// ─────────────────────────────────────────────
function resolveIframeStream(iframeUrl, referer) {
  return fetch(iframeUrl, {
    headers: {
      "User-Agent": HEADERS["User-Agent"],
      "Referer": referer || BASE_URL
    }
  })
    .then(function (res) {
      return res.text();
    })
    .then(function (html) {
      var found = [];

      var m3u8Regex = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi;
      var mMatch;
      while ((mMatch = m3u8Regex.exec(html)) !== null) {
        found.push({
          name: "WFilmizle",
          title: "HD",
          url: mMatch[1],
          quality: "HD",
          headers: { Referer: iframeUrl }
        });
      }

      var jwRegex = /file\s*:\s*["']([^"']+)["']/gi;
      var jMatch;
      while ((jMatch = jwRegex.exec(html)) !== null) {
        var fileUrl = jMatch[1];
        if (fileUrl.indexOf("m3u8") !== -1 || fileUrl.indexOf(".mp4") !== -1) {
          found.push({
            name: "WFilmizle",
            title: "HD",
            url: fileUrl,
            quality: "HD",
            headers: { Referer: iframeUrl }
          });
        }
      }

      return found;
    })
    .catch(function (err) {
      console.log("[WFilmizle] iframe çözümlenemedi: " + err.message);
      return [];
    });
}

// ─────────────────────────────────────────────
// ANA FONKSİYON
// ─────────────────────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[WFilmizle] Başlatılıyor: " + mediaType + " ID=" + tmdbId);

  if (!TMDB_API_KEY) {
    console.error("[WFilmizle] TMDB_API_KEY tanımlı değil!");
    return Promise.resolve([]);
  }

  return getTmdbTitle(tmdbId, mediaType)
    .then(function (title) {
      if (!title) {
        console.log("[WFilmizle] Başlık bulunamadı.");
        return [];
      }
      console.log("[WFilmizle] Başlık: " + title);
      return searchSite(title);
    })
    .then(function (filmUrl) {
      if (!filmUrl) return [];
      return extractFromPage(filmUrl).then(function (streams) {
        // Eğer sadece iframe stream'leri bulduysa, iframe'leri de çöz
        var iframeStreams = streams.filter(function (s) {
          return (
            s.url.indexOf(".m3u8") === -1 &&
            s.url.indexOf(".mp4") === -1 &&
            (s.url.indexOf("http") === 0)
          );
        });

        if (iframeStreams.length > 0 && streams.length === iframeStreams.length) {
          // Tüm stream'ler iframe, içlerini çözmeye çalış
          var resolvePromises = iframeStreams.map(function (s) {
            return resolveIframeStream(s.url, filmUrl);
          });

          return Promise.all(resolvePromises).then(function (results) {
            var resolved = [];
            results.forEach(function (r) {
              resolved = resolved.concat(r);
            });

            // Çözümlenen varsa onları kullan, yoksa orijinal iframe stream'leri dön
            return resolved.length > 0 ? resolved : streams;
          });
        }

        return streams;
      });
    })
    .catch(function (err) {
      console.error("[WFilmizle] Hata: " + err.message);
      return [];
    });
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
