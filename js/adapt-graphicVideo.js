import Adapt from 'core/js/adapt';
import { AdaptTemplateRenderModifier, DOMModifier } from './injector';
import VideoView from './VideoView';

class GraphicVideo extends Backbone.Controller {

  initialize() {
    this.listenTo(Adapt, 'app:dataReady', this.onDataReady);
  }

  onDataReady() {
    const config = Adapt.course.get('_graphicVideo');
    if (!config?._isEnabled) return;
    this.setUpEventListeners();
    this.setUp();
  }

  setUpEventListeners() {
    document.body.addEventListener('transitionend', this.checkOnScreen.bind(this));
    this.listenTo(Adapt, 'notify:opened', this.checkOnScreen);
  }

  checkOnScreen() {
    $.inview();
  }

  setUp() {
    const config = Adapt.course.get('_graphicVideo');
    const fileExtension = config._fileExtension || 'svgz';
    const rex = new RegExp(`\\.${fileExtension}`, 'i');
    new AdaptTemplateRenderModifier({
      htmlTest(html) {
        return rex.test(html);
      },
      htmlModify(html) {
        const $template = $(`<div>${html}</div>`);
        const $images = $template.find('img').filter((index, img) => {
          return rex.test(img.src) || rex.test(img.getAttribute('data-large')) || rex.test(img.getAttribute('data-small'));
        });
        if (!$images.length) return;
        $images.each((index, img) => {
          const div = document.createElement('div');
          $(img).replaceWith(div);
          div.setAttribute('data-graphicvideo', true);
          $(div).attr({
            ...[...img.attributes].reduce((attrs, { name, value }) => ({ ...{ [name]: value }, ...attrs }), {}),
            class: img.className,
            id: img.id
          });
        });
        return $template.html();
      }
    });

    let waitFor = 0;
    new DOMModifier({
      elementFilter(element) {
        return element.getAttribute('data-graphicvideo');
      },
      onElementAdd(div) {
        if (waitFor === 0) {
          Adapt.wait.begin();
        }
        waitFor++;
        div.videoView = new VideoView({ el: div });
        div.videoView.on('ready', () => {
          waitFor--;
          if (waitFor === 0) {
            Adapt.wait.end();
          }
        });
      },
      onElementRemove(div) {
        div.videoView.remove();
        div.videoView = null;
      }
    });

  }

}

export default new GraphicVideo();
