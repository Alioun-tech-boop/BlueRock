import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize un URL d'image pour prévenir les attaques XSS
 * Accepte uniquement les URLs valides (http/https/data:image)
 */
export function sanitizeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  
  // Nettoyer l'URL avec DOMPurify (supprime javascript:, vbscript:, etc.)
  const cleanUrl = DOMPurify.sanitize(url, { 
    ALLOWED_URI_REGEXP: /^(?:https?:)?\/\/|^data:image\//i 
  });
  
  // Vérifier que l'URL nettoyée est toujours une URL valide
  try {
    const parsed = new URL(cleanUrl, window.location.origin);
    // Autoriser seulement http, https, et data:image
    if (!['http:', 'https:'].includes(parsed.protocol) && !cleanUrl.startsWith('data:image/')) {
      return null;
    }
    return cleanUrl;
  } catch {
    // Si ce n'est pas une URL valide, essayer comme data:image
    if (cleanUrl.startsWith('data:image/')) {
      return cleanUrl;
    }
    return null;
  }
}

/**
 * Sanitize un texte pour affichage sûr (évite XSS dans le texte)
 */
export function sanitizeText(text: string | undefined | null): string {
  if (!text) return '';
  return DOMPurify.sanitize(text, { 
    ALLOWED_TAGS: [], 
    ALLOWED_ATTR: [] 
  });
}

/**
 * Sanitize HTML pour affichage sûr (garde seulement les tags de base)
 */
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
  });
}