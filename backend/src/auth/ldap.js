/**
 * LDAP-Authentifizierung
 */

const ldap = require('ldapjs');
const {
  LDAP_ENABLED, LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PW,
  LDAP_SEARCH_BASE, LDAP_SEARCH_FILTER, LDAP_ROLE_MAP,
} = require('../config');

function ldapAuthenticate(username, password) {
  return new Promise((resolve, reject) => {
    if (!LDAP_ENABLED) return reject(new Error('LDAP not enabled'));

    const client = ldap.createClient({
      url: LDAP_URL,
      connectTimeout: 5000,
      timeout: 5000,
    });

    client.on('error', (err) => {
      console.error('LDAP error:', err.message);
      reject(new Error('LDAP connection failed'));
    });

    client.bind(LDAP_BIND_DN, LDAP_BIND_PW, (err) => {
      if (err) { client.destroy(); return reject(new Error('LDAP service bind failed')); }

      const filter = LDAP_SEARCH_FILTER.replace('{{username}}', username.replace(/[()\\*]/g, ''));
      const searchOpts = { scope: 'sub', filter, attributes: ['uid', 'cn', 'mail', 'displayName', 'memberOf'] };

      client.search(LDAP_SEARCH_BASE, searchOpts, (err, res) => {
        if (err) { client.destroy(); return reject(new Error('LDAP search failed')); }

        let userEntry = null;

        res.on('searchEntry', (entry) => {
          userEntry = { dn: entry.objectName || entry.dn, uid: null, cn: null, mail: null, displayName: null, memberOf: [] };
          if (entry.attributes) {
            for (const attr of entry.attributes) {
              const name = attr.type || attr._type;
              const vals = attr.values || attr.vals || attr._vals || [];
              if (name === 'uid') userEntry.uid = vals[0]?.toString?.() || vals[0];
              if (name === 'cn') userEntry.cn = vals[0]?.toString?.() || vals[0];
              if (name === 'mail') userEntry.mail = vals[0]?.toString?.() || vals[0];
              if (name === 'displayName') userEntry.displayName = vals[0]?.toString?.() || vals[0];
              if (name === 'memberOf') userEntry.memberOf = vals.map(v => v.toString?.() || v);
            }
          }
        });

        res.on('error', () => { client.destroy(); reject(new Error('LDAP search error')); });

        res.on('end', () => {
          if (!userEntry) { client.destroy(); return reject(new Error('User not found in LDAP')); }

          client.bind(userEntry.dn, password, (err) => {
            client.destroy();
            if (err) return reject(new Error('Invalid LDAP credentials'));

            let role = 'viewer';
            for (const mo of userEntry.memberOf) {
              const cnMatch = mo.match(/cn=([^,]+)/i);
              if (cnMatch) {
                const group = cnMatch[1].toLowerCase();
                if (LDAP_ROLE_MAP[group]) {
                  const mapped = LDAP_ROLE_MAP[group];
                  if (mapped === 'admin') role = 'admin';
                  else if (mapped === 'editor' && role !== 'admin') role = 'editor';
                }
              }
            }

            resolve({
              username: userEntry.uid || username,
              displayName: userEntry.displayName || userEntry.cn || username,
              email: userEntry.mail || '',
              role,
            });
          });
        });
      });
    });
  });
}

module.exports = { ldapAuthenticate };
