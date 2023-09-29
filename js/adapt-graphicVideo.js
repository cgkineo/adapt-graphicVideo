import Adapt from 'core/js/adapt';
import wait from 'core/js/wait';
import { DOMModifier } from './injector';
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
    let waitFor = 0;
    new DOMModifier({
      elementAddFilter(element) {
        if (element.nodeName !== 'IMG') return;
        const img = element;
        return rex.test(img.src) || rex.test(img.getAttribute('data-large')) || rex.test(img.getAttribute('data-small'));
      },
      onElementAdd(img) {
        const div = document.createElement('div');
        $(img).replaceWith(div);
        div.setAttribute('data-graphicvideo', true);
        $(div).attr({
          ...[...img.attributes].reduce((attrs, { name, value }) => ({ ...{ [name]: value }, ...attrs }), {}),
          class: img.className,
          id: img.id
        });
        if (waitFor === 0) {
          wait.begin();
        }
        waitFor++;
        div.videoView = new VideoView({ el: div });
        div.videoView.on('ready', () => {
          waitFor--;
          if (waitFor === 0) {
            wait.end();
          }
        });
      },
      elementRemoveFilter(element) {
        return element.getAttribute('data-graphicvideo');
      },
      onElementRemove(div) {
        div.videoView?.remove();
        div.videoView = null;
      }
    });
  }

}

export default new GraphicVideo();
