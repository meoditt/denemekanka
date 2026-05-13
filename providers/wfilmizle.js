/**
 * WFilmizle - Nuvio Provider
 * Düzeltmeler:
 * - manifest.json: "scrapers" -> "providers" 
 * - Arama: daha geniş regex + çoklu sonuç denemesi
 * - Headers: pipe formatı yerine doğru Nuvio headers objesi
 * - module.exports: global.getStreams kaldırıldı
 * - console.log eklendi (Plugin Tester'da debug için)
 */

var BASE_URL = "https://www.wfilmizle.bar";
var TMDB_API_KEY = "314ea98913199aa268f4b0151b29994a";

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8",
  "Referer": BASE_URL
};

// TMDB'den Türkçe film adını al
function getTmdbTitle(tmdbId, mediaType) {
  var url = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=tr-TR";
  console.log("[WFilmizle] TMDB URL: " + url);
  return fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var title = data.title || data.name || data.original_title || data.original_name || null;
      console.log("[WFilmizle] TMDB title: " + title);
      return title;
    })
    .catch(function (e) {
      console.error("[WFilmizle] TMDB hatasi: " + e.message);
      return null;
    });
}

// Sitede film ara - birden fazla URL dene
function searchSite(title) {
  var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
  console.log("[WFilmizle] Arama URL: " + searchUrl);

  return fetch(searchUrl, { headers: HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      // wfilmizle.bar'daki tüm film linkerlerini topla
      // Sitenin URL yapısı: /film-adi-izle/ veya /film-adi/
      var urls = [];

      // Önce href içindeki tüm wfilmizle.bar linklerini topla
      var linkRegex = /href="(https?:\/\/(?:www\.)?wfilmizle\.bar\/[^"#?]+)"/gi;
      var match;
      while ((match = linkRegex.exec(html)) !== null) {
        var url = match[1];
        // Anasayfa, kategori, tag, sayfa linklerini filtrele
        if (
          url !== BASE_URL + "/" &&
          url.indexOf("/category/") === -1 &&
          url.indexOf("/tag/") === -1 &&
          url.indexOf("/page/") === -1 &&
          url.indexOf("/?") === -1 &&
          url.indexOf("/wp-") === -1 &&
          url.indexOf("/feed") === -1 &&
          url.length > BASE_URL.length + 5
        ) {
          if (urls.indexOf(url) === -1) {
            urls.push(url);
          }
        }
      }

      console.log("[WFilmizle] Bulunan film URL sayisi: " + urls.length);
      if (urls.length > 0) {
        console.log("[WFilmizle] Ilk URL: " + urls[0]);
      }

      // Başlığa en çok benzeyen URL'i bul
      if (urls.length === 0) return null;

      // Başlığı URL-slug formatına çevir (basit karşılaştırma için)
      var titleSlug = title
        .toLowerCase()
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      console.log("[WFilmizle] Aranan slug: " + titleSlug);

      // Slug içeren URL varsa onu döndür
      for (var i = 0; i < urls.length; i++) {
        if (urls[i].toLowerCase().indexOf(titleSlug) !== -1) {
          console.log("[WFilmizle] Eslesen URL: " + urls[i]);
          return urls[i];
        }
      }

      // Eşleşme yoksa ilk sonucu dön (çoğunlukla doğru sonuçtur)
      return urls[0];
    })
    .catch(function (e) {
      console.error("[WFilmizle] Arama hatasi: " + e.message);
      return null;
    });
}

// Film sayfasından stream URL'lerini çıkar
function extractFromPage(pageUrl) {
  console.log("[WFilmizle] Sayfa isleniyor: " + pageUrl);
  return fetch(pageUrl, { headers: HEADERS })
    .then(function (res) { return res.text(); })
    .then(function (html) {
      var streams = [];

      // iframe src'lerini topla
      var iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var iMatch;
      while ((iMatch = iframeRegex.exec(html)) !== null) {
        var src = iMatch[1].trim();
        if (
          src.indexOf("google") === -1 &&
          src.indexOf("youtube") === -1 &&
          src.indexOf("facebook") === -1 &&
          src.length > 20
        ) {
          console.log("[WFilmizle] iframe bulundu: " + src);
          streams.push({ url: src, isIframe: true });
        }
      }

      // Direkt m3u8 URL'lerini topla
      var m3u8Regex = /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi;
      var mMatch;
      while ((mMatch = m3u8Regex.exec(html)) !== null) {
        console.log("[WFilmizle] m3u8 bulundu: " + mMatch[1]);
        streams.push({ url: mMatch[1], isIframe: false });
      }

      console.log("[WFilmizle] Toplam ham stream: " + streams.length);
      return streams;
    })
    .catch(function (e) {
      console.error("[WFilmizle] Sayfa cekme hatasi: " + e.message);
      return [];
    });
}

// Stream nesnesini çöz / oynatılabilir URL al
function resolveStream(sObj) {
  // Direkt m3u8 - hemen döndür
  if (!sObj.isIframe) {
    return Promise.resolve([{
      name: "WFilmizle",
      title: "Direkt HD",
      url: sObj.url,
      quality: "HD",
      headers: {
        "Referer": BASE_URL,
        "User-Agent": HEADERS["User-Agent"]
      }
    }]);
  }

  var iframeUrl = sObj.url;

  // Göreceli URL'yi mutlak yap
  if (iframeUrl.indexOf("http") !== 0) {
    if (iframeUrl.indexOf("//") === 0) {
      iframeUrl = "https:" + iframeUrl;
    } else {
      iframeUrl = BASE_URL + (iframeUrl.indexOf("/") === 0 ? "" : "/") + iframeUrl;
    }
  }

  // HDPlayerSystem özel işleme
  if (iframeUrl.indexOf("hdplayersystem.com") !== -1) {
    var match = iframeUrl.match(/\/video\/([a-zA-Z0-9]+)/);
    var videoId = match ? match[1] : null;

    if (!videoId) {
      console.log("[WFilmizle] HDPlayer: videoId bulunamadi - " + iframeUrl);
      return Promise.resolve([]);
    }

    var apiUrl = "https://hdplayersystem.com/player/index.php?data=" + videoId + "&do=getVideo";
    console.log("[WFilmizle] HDPlayer API: " + apiUrl);

    return fetch(apiUrl, {
      method: "GET",
      headers: {
        "Referer": iframeUrl,
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": HEADERS["User-Agent"]
      }
    })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        try {
          var apiData = JSON.parse(text);
          if (apiData && apiData.securedLink) {
            console.log("[WFilmizle] HDPlayer securedLink alindi");
            return [{
              name: "WFilmizle",
              title: "HDPlayer HD",
              url: apiData.securedLink,
              quality: "HD",
              headers: {
                "Referer": "https://hdplayersystem.com/",
                "Origin": "https://hdplayersystem.com",
                "User-Agent": HEADERS["User-Agent"]
              }
            }];
          }
        } catch (e) {
          console.error("[WFilmizle] HDPlayer JSON parse hatasi: " + e.message);
        }
        return [];
      })
      .catch(function (err) {
        console.error("[WFilmizle] HDPlayer hatasi: " + err.message);
        return [];
      });
  }

  // Diğer iframe'leri de dahil et (SD kalite olarak)
  console.log("[WFilmizle] Diger iframe: " + iframeUrl);
  return Promise.resolve([{
    name: "WFilmizle",
    title: "Alternatif",
    url: iframeUrl,
    quality: "SD",
    headers: {
      "Referer": BASE_URL,
      "User-Agent": HEADERS["User-Agent"]
    }
  }]);
}

// Ana fonksiyon - Nuvio tarafından çağrılır
function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[WFilmizle] getStreams cagrildi - tmdbId: " + tmdbId + " mediaType: " + mediaType);

  if (!TMDB_API_KEY) {
    console.error("[WFilmizle] TMDB API key eksik!");
    return Promise.resolve([]);
  }

  return getTmdbTitle(tmdbId, mediaType)
    .then(function (title) {
      if (!title) {
        console.log("[WFilmizle] Film adi alinamadi");
        return [];
      }
      return searchSite(title);
    })
    .then(function (filmUrl) {
      if (!filmUrl) {
        console.log("[WFilmizle] Film URL bulunamadi");
        return [];
      }
      return extractFromPage(filmUrl).then(function (rawStreams) {
        if (rawStreams.length === 0) {
          console.log("[WFilmizle] Sayfada stream bulunamadi");
          return [];
        }

        var resolvePromises = rawStreams.map(function (s) {
          return resolveStream(s);
        });

        return Promise.all(resolvePromises).then(function (results) {
          var resolved = [];
          for (var i = 0; i < results.length; i++) {
            if (results[i] && results[i].length > 0) {
              resolved = resolved.concat(results[i]);
            }
          }
          console.log("[WFilmizle] Sonuc stream sayisi: " + resolved.length);
          return resolved;
        });
      });
    })
    .catch(function (err) {
      console.error("[WFilmizle] getStreams genel hata: " + err.message);
      return [];
    });
}

module.exports = { getStreams: getStreams };
