const BASE_URL = "https://www.wfilmizle.bar";

function search(query) {
    const searchUrl = BASE_URL + "/?s=" + encodeURIComponent(query);
    
    return fetch(searchUrl)
        .then(res => res.text())
        .then(html => {
            const $ = cheerio.load(html);
            const results = [];
            
            // Senin gönderdiğin HTML'deki "movie-preview" sınıfını kullanıyoruz
            $('.movie-preview').each((i, el) => {
                const title = $(el).find('.movie-title').text().trim() || $(el).find('a[title]').attr('title');
                const link = $(el).find('.movie-poster a').attr('href') || $(el).find('a').attr('href');
                const poster = $(el).find('.movie-poster img').attr('src') || $(el).find('img').attr('src');
                
                if (title && link) {
                    results.push({
                        title: title,
                        url: link,
                        poster: poster
                    });
                }
            });
            return results;
        });
}

function getSources(url) {
    return fetch(url)
        .then(res => res.text())
        .then(html => {
            const $ = cheerio.load(html);
            const sources = [];
            
            // Senin gönderdiğin HTML'deki gömülü oynatıcı iframe'ini yakalıyoruz
            const iframeSrc = $('.autosize-container iframe').attr('src') || $('iframe').attr('src');
            
            if (iframeSrc) {
                sources.push({
                    name: "WHDPlayer",
                    url: iframeSrc,
                    type: "iframe"
                });
            }
            
            return sources;
        });
}

module.exports = {
    search: search,
    getSources: getSources
};