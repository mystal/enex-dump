
/* IMPORT */

const _ = require ( 'lodash' ),
      matter = require ( 'gray-matter' ),
      {html: beautifyHTML} = require ( 'js-beautify' ),
      reshape = require ( 'reshape' ),
      turndown = require ( 'turndown' ),
      Matter = require ( './matter' );

/* CONTENT */

const Content = {

  format: {

    html ( html, title ) {

      html = html.replace ( /<!DOCTYPE(.*?)>/g, '' ) // Remove doctype
                 .replace ( /<\?xml(.*?)>/g, '' ) // Remove xml thing (what's it called?)
                 .replace ( /<en-todo checked="true"(.*?)\/?>/g, '<input type="checkbox" checked />' ) // Replace checked checkbox
                 .replace ( /<en-todo checked="false"(.*?)\/?>/g, '<input type="checkbox" />' ) // Replace unchecked checkbox
                 .replace ( /<\/?en-(\w+)(.*?)>/g, '' ) // Remove custom evernote tags
                 .replace ( /<div>(\s*)<\/div>/g, '' ) // Remove empty divs
                 .replace ( /(<div>(\s*)<br ?\/>(\s*)<\/div>){2,}/g, '<div><br /></div>' ); // Remove extra line breaks

      if ( title ) {
        html = `<h1>${title}</h1>${html}`;
      }

      return beautifyHTML ( html )
                 .replace ( /^\s*/, '\n' ) // Ensure it starts with a new line
                 .replace ( /\s*$/, '\n' ); // Ensure it ends with a new line

    },

    async markdown ( html, title ) {

      html = Content.format.html ( html, title );

      function reshapePlugin ( ast ) {
        return ast.map ( entry => {
          /* CODE */
          if ( entry.type === 'tag' && entry.attrs && entry.attrs.style && entry.attrs.style[0].content.includes ( '-en-codeblock' ) ) {
            entry.name = 'span';
            entry.attrs.style[0].content = '-en-codeblock';
          }
          /* ALIGNMENT */
          if ( entry.type === 'tag' && entry.attrs && entry.attrs.style && entry.attrs.style[0].content.includes ( 'text-align' ) ) {
            entry.name = 'span';
          }
          return entry;
        })
      }

      html = ( await reshape ({ plugins: reshapePlugin }).process ( html ) ).output ();

      html = html.replace ( /<input(.*?)type="checkbox"([^>]*?)checked(.*?)>/g, ' [x] ' ) // Replace checked checkbox
                 .replace ( /<input(.*?)type="checkbox"(.*?)>/g, ' [ ] ' ); // Replace unchecked checkbox

      const service = new turndown ({
        bulletListMarker: '-',
        headingStyle: 'atx',
        hr: '---'
      });

      service.addRule ( 'formatting', {
        filter: ['font', 'span'],
        replacement: ( str, ele ) => {
          if ( !_.trim ( str ) ) return '';
          /* STYLE */
          const style = ele.getAttribute ( 'style' );
          let newStyle = '';
          if ( style ) {
            /* ALIGNENT */
            const alignment = style.match ( /text-align: (\S+);/ );
            if ( alignment && !str.match ( /<table/ ) ) {
              str = `<p align="${alignment[1]}">${_.trim ( str )}</p>\n\n`;
            }
            /* FORMATTING */
            if ( style.match ( /text-decoration: underline/ ) ) { // Underline
              str = `<u>${str}</u>`;
            }
            if ( style.match ( /text-decoration: line-through/ ) ) { // Strikethrough
              str = `<s>${str}</s>`;
            }
            if ( style.match ( /font-style: italic/ ) ) { // Italic
              str = `_${str}_`;
            }
            if ( style.match ( /font-weight: bold/ ) ) { // Bold
              str = `**${str}**`;
            }
            /* HEADING */
            if ( str.match ( /^[^#]|>#/ ) ) { // Doesn't contain an heading
              if ( style.match ( /font-size: (48|64|72)px/ ) ) { // H1
                str = `# ${str}`;
              }
              if ( style.match ( /font-size: 36px/ ) ) { // H2
                str = `## ${str}`;
              }
              if ( style.match ( /font-size: 24px/ ) ) { // H3
                str = `### ${str}`;
              }
              if ( style.match ( /font-size: (12|13)px/ ) ) { // Small
                str = `<small>${str}</small>`;
              }
              if ( style.match ( /font-size: (9|10|11)px/ ) ) { // Very Small
                str = `<small><small>${str}</small></small>`;
              }
            }
            /* CODE */
            if ( style.match ( /-en-codeblock/ ) ) { // Code block
              str = _.trim ( str ).replace ( /<(?:.|\n)*?>/gm, '' );
              str = str.includes ( '\n' ) ? `\n\n\`\`\`\n${str}\n\`\`\`\n` : `\`${str}\``;
            }
            /* BACKGROUND COLOR */
            const backgroundColor = style.match ( /background-color: ([^;]+);/ );
            if ( backgroundColor && backgroundColor[1] !== 'rgb(255, 255, 255)' ) {
              newStyle += backgroundColor[0];
            }
          }
          /* COLOR */
          const colorAttr = ele.getAttribute ( 'color' ); // Color
          if ( colorAttr ) {
            newStyle += `color: ${colorAttr};`
          }
          if ( style ) {
            const colorStyle = style.match ( /[^-]color: ([^;]+);/ );
            if ( colorStyle ) {
              newStyle += `color: ${colorStyle[1]};`;
            }
          }
          /* NEW STYLE */
          if ( newStyle ) {
            str = `<span style="${newStyle}">${str}</span>`;
          }
          return str;
        }
      });

      service.keep ([ 'kbd' ]);
      service.keep ([ 'b', 'i', 's', 'u' ]); // 😚

      return service.turndown ( html )
                    .replace ( /\\((-|\*|\+) )/g, '$1' ) // Unescape unordered lists
                    .replace ( /^(-|\*|\+)\s+/gm, '$1 ' ) // Remove extra whitespace from unordered lists
                    .replace ( /^(\d+\.)\s+/gm, '$1 ' ) // Remove extra whitespace from ordered lists
                    .replace ( /\\\[(.)\\\] /g, '[$1] ' ) // Unescape checkboxes
                    .replace ( /(\s*\n\s*){4,}/g, '\n\n<br />\n\n' ) // Add line breaks
                    .replace ( /(\s*\n\s*){3,}/g, '\n\n' ) // Remove extra new lines
                    .replace ( /\n\n<br \/>\n\n(-|\*|\+) /g, '\n\n$1 ' ) // Remove line breaks before lists
                    .replace ( /^\s*/, '\n' ) // Ensure it starts with a new line
                    .replace ( /\s*$/, '\n' ); // Ensure it ends with a new line

    }

  },

  metadata: {

    options: {
      engines: {
        yaml: Matter
      }
    },

    get ( content ) {

      return matter ( content, Content.metadata.options ).data;

    },

    set ( content, metadata ) {

      content = Content.metadata.remove ( content );

      if ( !_.isEmpty ( metadata ) ) {

        content = matter.stringify ( content, metadata, Content.metadata.options );

      }

      return content;

    },

    remove ( content ) {

      return matter ( content, Content.metadata.options ).content;

    }

  }

};

/* EXPORT */

module.exports = Content;
