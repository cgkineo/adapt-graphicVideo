# Adapt Graphic Video

**Adapt Graphic Video** is an *extension* that renders looping mp4 videos in place of graphics. It works *only* where graphics are rendered as *img* tags and not everywhere graphics are rendered as *img* tags, due to custom styling and behaviour.

## Settings Overview

The attributes listed below are used in *course.json* to configure **Adapt Graphic Video**, and are properly formatted as JSON in [*example.json*](https://github.com/cgkineo/adapt-graphicVideo/blob/master/example.json).

### Attributes

**\_graphicVideo** (object): It contains values for **\_isEnabled**, **\_fileExtension**, **\_loops**, **\_autoPlay**, **\_onScreenPercentInviewVertical**, **\_offScreenPause**, **\_offScreenRewind**, **\_showPauseControl** and **\_onPauseRewind**

>**\_isEnabled** (String): Defaults to `true`.

>**\_fileExtension** (String): The image file extension of the json file. Acceptable values are `mp4`, `tiff`, `jpe`. Defaults to `mp4`.

>**\_loops** (Boolean): Controls if the video should loop. Defaults to `true`.

>**\_autoPlay** (Boolean): Should the videos play when on screen. Note: Percentage onscreen determines when autoplay occurs. Defaults to `true`.

>**\_onScreenPercentInviewVertical** (Number): What percentage of the SVG container should be on-screen before the videos are triggered. Defaults to `1`.

>**\_offScreenPause** (Boolean): Pause when off screen. Defaults to `true`.

>**\_offScreenRewind** (Boolean): Rewind when off screen. Defaults to `true`.

>**\_showPauseControl** (Boolean): Show the play / pause button. Defaults to `false`.

>**\_onPauseRewind** (Boolean): Rewind when the pause button is clicked. Defaults to `false`.

----------------------------
**Version number:**  0.1.0<br />
**Framework versions:**  >=5.14<br />
**Author / maintainer:** Kineo<br />
**Accessibility support:** Yes<br />
**RTL support:** Yes<br />
**Cross-platform coverage:** Evergreen + IE11<br />
