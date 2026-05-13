/**
 * WFilmizle - Nuvio Provider (404 REFERER FIX SÜRÜMÜ)
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
    })
    .catch(function() { return null; });
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
      var iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var iMatch;
      
      while ((iMatch = iframeRegex.exec(html)) !== null) {
        var src = iMatch[1].trim();
        if (src.indexOf("google") === -1 && src.indexOf("youtube") === -1 && src.length > 20) {
          streams.push({ name: "WFilmizle", title: "API Çözümleniyor...", url: src });
        }
      }
      return streams;
    })
    .catch(function(e) { return []; });
}

function resolveIframeStream(iframeUrl) {
  if (iframeUrl.indexOf("hdplayersystem.com") !== -1) {
    var match = iframeUrl.match(/\/video\/([a-zA-Z0-9]+)/);
    var videoId = match ? match[1] : null;

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
    .then(function(res) { return res.text(); })
    .then(function(text) {
      try {
        var apiData = JSON.parse(text);
        if (apiData && apiData.securedLink) {
          
          // İŞTE ÇÖZÜM BURADA: Nuvio oynatıcısının 404 vermemesi için linkin sonuna | ile sahte kimlik ekliyoruz
          var cloudstreamFormattedUrl = apiData.securedLink + "|Referer=https://hdplayersystem.com/&Origin=https://hdplayersystem.com/&User-Agent=" + encodeURIComponent(HEADERS["User-Agent"]);

          return [{
            name: "WFilmizle",
            title: "HD (HLS Oynat)",
            url: cloudstreamFormattedUrl, 
            quality: "HD"
            // headers objesini kaldırdık çünkü URL içine gömdük
          }];
        }
      } catch(e) {
        console.log("JSON Parçalama hatası");
      }
      return [];
    })
    .catch(function(err) {
      return [];
    });
  }

  return Promise.resolve([]);
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (!TMDB_API_KEY) return Promise.resolve([]);

  return getTmdbTitle(tmdbId, mediaType)
    .then(function (title) {
      if (!title) return [];
      return searchSite(title).then(function(filmUrl) {
         return { title: title, url: filmUrl };
      });
    })
    .then(function (data) {
      if (!data.url) return [];
      
      return extractFromPage(data.url).then(function (streams) {
        var resolvePromises = streams.map(function (s) {
          return resolveIframeStream(s.url);
        });

        return Promise.all(resolvePromises).then(function (results) {
          var resolved = [];
          results.forEach(function (r) { resolved = resolved.concat(r); });
          return resolved;
        });
      });
    })
    .catch(function (err) { return []; });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
