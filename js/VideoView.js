import Adapt from 'core/js/adapt';
import a11y from 'core/js/a11y';
import device from 'core/js/device';
import documentModifications from 'core/js/DOMElementModifications';
import MSE from './MSE';

export default class VideoView extends Backbone.View {

  events() {
    return {
      'click .graphicvideo__playpause': 'onPlayPauseClick',
      click: 'onGeneralPlayPause'
    };
  }

  initialize() {
    _.bindAll(this, 'render', 'onScreenChange', 'update', 'onDataReady');
    this.config = Adapt.course.get('_graphicVideo');
    this.fileExtensions = this.config._fileExtension?.split(',') || ['mp4', 'avif'];
    this._rex = new RegExp(`\\.(${this.fileExtensions.map(ext => ext.trim()).join('|')})`, 'i');
    this.hasUserPaused = false;
    this.isPausedWithVisua11y = this.hasA11yNoAnimations;
    this.isDataReady = false;
    this.setUpOriginalValues();
    this.resetToOriginalValues();
    this.setUpAttributeChangeObserver();
    this.setUpListeners();
    this.render();
  }

  setUpOriginalValues() {
    if (this.config._originalLoops === undefined) {
      this.config._originalLoops = this.config._loops;
    }
    if (this.config._originalAutoPlay === undefined) {
      this.config._originalAutoPlay = this.config._autoPlay;
    }
  }

  resetToOriginalValues() {
    if (this.isPausedWithVisua11y) { return; }

    this.config._loops = this.config._originalLoops;
    this.config._autoPlay = this.config._originalAutoPlay;
  }

  setUpAttributeChangeObserver() {
    const observer = new MutationObserver(this.render);
    observer.observe(this.el, { attributes: true });
  }

  setUpListeners() {
    this.$el.on('onscreen', this.onScreenChange);
    this.listenTo(Adapt, 'device:resize', this.render);
    this.listenTo(documentModifications, 'changed:html', this.checkVisua11y);
  }

  onScreenChange(event, { onscreen, percentInview } = {}) {
    if (!this.video) return;
    const isOffScreen = (!onscreen || percentInview < (this.config._onScreenPercentInviewVertical ?? 1));
    if (isOffScreen) return this.onOffScreen();
    this.onOnScreen();
  }

  onOffScreen() {
    if (this.isPaused || this.hasUserPaused) return;
    if (!this.config._offScreenPause) return;
    this.pause(true);
    if (!this.config._offScreenRewind) return;
    this.rewind();
  }

  onOnScreen() {
    if (!this.isPaused) return;
    this.$player.removeClass('is-graphicvideo-nocontrols');
    if (!this.config._autoPlay) return;
    if (this.hasUserPaused) return;
    this.play(true);
  }

  play(noControls = false) {
    const isFinished = (parseInt(this.video.currentTime) === parseInt(this.video.duration));
    if (isFinished) {
      this.video.pause();
    }
    this.video.play();
    this.update();
    if (noControls) {
      this.$player.removeClass('is-graphicvideo-nocontrols');
    }
  }

  pause(noControls = false) {
    if (noControls) {
      this.$player.addClass('is-graphicvideo-nocontrols');
    }
    this.video.pause();
    this.update();
  }

  get isPaused() {
    return this.video.paused;
  }

  togglePlayPause(noControls) {
    this[this.isPaused ? 'play' : 'pause'](noControls);
  }

  rewind() {
    this.video.currentTime = 0;
    this.update();
  }

  rewindAndStop() {
    this.rewind();
    this.pause();
    this.video.loop = false;
    this.video.autoplay = false;
    this.config._loops = false;
    this.config._autoPlay = false;
  }

  restart() {
    this.video.loop = this.config._originalLoops;
    this.video.autoplay = this.config._originalAutoPlay;
    this.config._loops = this.config._originalLoops;
    this.config._autoPlay = this.config._originalAutoPlay;
    this.play();
  }

  update() {
    this.$player.toggleClass('is-graphicvideo-playing', !this.video.paused);
    this.$player.toggleClass('is-graphicvideo-paused', this.video.paused);
    const isNotAtStart = (this.video.currentTime !== 0);
    a11y.toggleEnabled(this.$player.find('.graphicvideo__rewind'), isNotAtStart);
  }

  render() {
    if (!this.shouldRender) return;
    this._renderedSrc = this.src;
    const isVideo = this._rex.test(this.src);
    this.destroyVideo();
    this.$el.html(Handlebars.templates.graphicVideo({
      ...this.config,
      _isVideo: isVideo,
      _loops: this.config._loops,
      _src: this.src,
      alt: this.alt
    }));
    if (!isVideo) return;
    this.createVideo();
  }

  get $player() {
    return this.$('.graphicvideo__player');
  }

  get video() {
    return this.$player.find('video')[0];
  }

  async createVideo() {
    if (!this.video) return;
    const video = this.video;
    this.video.addEventListener('loadedmetadata', this.onDataReady);
    this.video.addEventListener('timeupdate', this.update);
    // safari cannot process invalid mime types, which you get
    // from a server when renaming a video from .mp4 to .avif
    const isSafariMimeTypeIssue = (device.browser === 'safari' && !/\.mp4/i.test(this.src));
    if (isSafariMimeTypeIssue) {
      this.mse = new MSE({
        video,
        src: this.src
      });
      return;
    }
    // assign the source straight to the tag for all other browsers
    video.src = this.src;
  }

  onDataReady() {
    this.isDataReady = true;
    this.pause();
    this.rewind();
    this.trigger('ready');
  }

  onEnterFrame() {
    this.update();
  }

  onGeneralPlayPause() {
    if (!this.config._showPauseControl) return;
    this.togglePlayPause();
    this.hasUserPaused = this.video.paused;
    if (this.hasUserPaused && this.config._onPauseRewind) {
      this.rewind();
    }
  }

  onPlayPauseClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this.onGeneralPlayPause();
  }

  destroyVideo() {
    if (!this.video) return;
    this.video.pause();
  }

  checkVisua11y() {
    if (!this.hasA11yNoAnimations && !this.isPausedWithVisua11y) return;

    // Check if animation should start playing again
    if (this.isPausedWithVisua11y && !this.hasA11yNoAnimations) {
      this.isPausedWithVisua11y = false;
      this.restart();
      return;
    }

    // Stop on last frame
    this.isPausedWithVisua11y = true;
    this.rewindAndStop();
  }

  get hasA11yNoAnimations() {
    const htmlClasses = document.documentElement.classList;
    return htmlClasses.contains('a11y-no-animations');
  }

  get shouldRender() {
    return (this._renderedSrc !== this.src);
  }

  get src() {
    const small = this.$el.attr('data-small');
    const large = this.$el.attr('data-large');
    const src = this.$el.attr('src');
    return src || (device.screenSize === 'small' ? small : large) || large;
  }

  get alt() {
    this._alt = this.$el.attr('aria-label') || this.$el.attr('alt') || this._alt;
    this.$el.removeAttr('aria-label attr');
    return this._alt;
  }

  remove() {
    this.mse?.destroy();
    this.destroyVideo();
    super.remove();
  }

}
