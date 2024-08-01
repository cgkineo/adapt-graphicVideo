import Adapt from 'core/js/adapt';
import a11y from 'core/js/a11y';
import device from 'core/js/device';
import documentModifications from 'core/js/DOMElementModifications';
import MP4Box from './mp4box';

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
    if (!window.MediaSource) {
      console.error('No Media Source API available');
      return;
    }
    function parseRange(response) {
      const range = response.headers.get('content-range');
      if (!range) {
        const length = response.headers.get('content-length');
        return {
          type: 'all',
          start: 0,
          end: length - 1,
          length
        };
      }
      const type = range.split(' ')[0];
      const length = parseInt(range.split(' ')[1].split('/')[1]);
      const start = parseInt(range.split(' ')[1].split('/')[0].split('-')[0]);
      const end = parseInt(range.split(' ')[1].split('/')[0].split('-')[1]);
      return {
        type,
        start,
        end,
        length
      };
    }
    const bufferSeconds = 4;
    let bufferAmount = (1024 * 512); // 0.128mb
    const video = this.video;
    video.crossOrigin = 'anonymous';
    const mediaSource = new MediaSource();
    this.video.src = window.URL.createObjectURL(mediaSource);
    video.load();
    await new Promise(resolve => mediaSource.addEventListener('sourceopen', resolve));
    let start = 0;
    let end = Number.MAX_SAFE_INTEGER;
    const response = await fetch(this.src, {
      headers: {
        Range: `bytes=${start}-${start + bufferAmount - 1}`
      }
    });
    const range = parseRange(response);
    end = range.length;
    const buffer = await response.arrayBuffer();
    start += bufferAmount;
    buffer.fileStart = 0;
    const info = await new Promise((resolve, reject) => {
      const mp4boxfile = MP4Box.createFile();
      mp4boxfile.onError = reject;
      mp4boxfile.onReady = resolve;
      mp4boxfile.appendBuffer(buffer);
      // todo: add to info buffer until returned
    });
    const mimeCodec = info.mime;
    if (!window.MediaSource.isTypeSupported(mimeCodec)) {
      console.error(`Video codec not supported: ${mimeCodec} for ${this.src}`);
      return;
    }
    let isLoadingMore = false;
    const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
    this.video.addEventListener('loadedmetadata', this.onDataReady);
    this.video.addEventListener('timeupdate', () => {
      checkMore();
      this.update();
    });
    const checkMore = () => {
      if (isLoadingMore) return;
      isLoadingMore = true;
      if (![...mediaSource.activeSourceBuffers].every(buf => !buf.updating)) {
        isLoadingMore = false;
        return;
      }
      const until = mediaSource.activeSourceBuffers[0].buffered.length === 0
        ? 0
        : mediaSource.activeSourceBuffers[0].buffered.end(0);
      if (until > 0) {
        const estimateBytesPerSecond = (start / until);
        bufferAmount = Math.round(estimateBytesPerSecond * bufferSeconds);
      }
      if (video.currentTime + bufferSeconds < until) {
        isLoadingMore = false;
        return;
      }
      loadMore();
      return true;
    };
    const loadMore = async () => {
      if (start + bufferAmount >= end) {
        bufferAmount = (end - start);
        if (bufferAmount < 0) bufferAmount = 0;
      }
      if (!bufferAmount) {
        mediaSource.endOfStream();
        return;
      }
      const response = await fetch(this.src, {
        headers: {
          Range: `bytes=${start}-${start + bufferAmount - 1}`
        }
      });
      const range = parseRange(response);
      end = range.length;
      const buffer = await response.arrayBuffer();
      start += bufferAmount;
      sourceBuffer.appendBuffer(buffer);
    };
    this.video.addEventListener('stalled', checkMore);
    sourceBuffer.addEventListener('updateend', () => {
      isLoadingMore = false;
      if (checkMore()) return;
      if (start === 0) video.load();
    });
    sourceBuffer.addEventListener('error', () => {
      throw new Error(`Error loading: ${this.src}`);
    });
    sourceBuffer.appendBuffer(buffer);

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
    this.destroyVideo();
    super.remove();
  }

}
