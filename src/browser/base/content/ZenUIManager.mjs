var gZenUIManager = {
  _popupTrackingElements: [],
  _hoverPausedForExpand: false,

  init() {
    document.addEventListener('popupshowing', this.onPopupShowing.bind(this));
    document.addEventListener('popuphidden', this.onPopupHidden.bind(this));
    XPCOMUtils.defineLazyPreferenceGetter(this, 'sidebarHeightThrottle', 'zen.view.sidebar-height-throttle', 500);
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      'contentElementSeparation',
      'zen.theme.content-element-separation',
      0
    );
    
    function throttle(f, delay) {
      let timer = 0;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => f.apply(this, args), delay);
      };
    }

    new ResizeObserver(throttle(this.updateTabsToolbar.bind(this), this.sidebarHeightThrottle)).observe(
      document.getElementById('tabbrowser-tabs')
    );
  },


  updateTabsToolbar() {
    // Set tabs max-height to the "toolbar-items" height
    const toolbarItems = document.getElementById('tabbrowser-tabs');
    const tabs = document.getElementById('tabbrowser-arrowscrollbox');
    tabs.style.maxHeight = '0px'; // reset to 0
    const toolbarRect = toolbarItems.getBoundingClientRect();
    let height = toolbarRect.height;
    // -5 for the controls padding
    let totalHeight = toolbarRect.height - (this.contentElementSeparation * 2) - 5;
    // remove the height from other elements that aren't hidden
    const otherElements = document.querySelectorAll('#tabbrowser-tabs > *:not([hidden="true"])');
    for (let tab of otherElements) {
      if (tabs === tab) continue;
      totalHeight -= tab.getBoundingClientRect().height;
    }
    tabs.style.maxHeight = totalHeight + 'px';
    //console.info('ZenThemeModifier: set tabs max-height to', totalHeight + 'px');
  },

  openAndChangeToTab(url, options) {
    if (window.ownerGlobal.parent) {
      const tab = window.ownerGlobal.parent.gBrowser.addTrustedTab(url, options);
      window.ownerGlobal.parent.gBrowser.selectedTab = tab;
      return tab;
    }
    const tab = window.gBrowser.addTrustedTab(url, options);
    window.gBrowser.selectedTab = tab;
    return tab;
  },

  generateUuidv4() {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
    );
  },

  toogleBookmarksSidebar() {
    const button = document.getElementById('zen-bookmark-button');
    SidebarController.toggle('viewBookmarksSidebar', button);
  },

  createValidXULText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /**
   * Adds the 'has-popup-menu' attribute to the element when popup is opened on it.
   * @param element element to track
   */
  addPopupTrackingAttribute(element) {
    this._popupTrackingElements.push(element);
  },

  removePopupTrackingAttribute(element) {
    this._popupTrackingElements.remove(element);
  },

  onPopupShowing(showEvent) {
    for (const el of this._popupTrackingElements) {
      // target may be inside a shadow root, not directly under the element
      // we also ignore menus inside panels
      if (!el.contains(showEvent.explicitOriginalTarget) || (showEvent.explicitOriginalTarget instanceof Element && showEvent.explicitOriginalTarget?.closest('panel'))) {
        continue;
      }
      document.removeEventListener('mousemove', this.__removeHasPopupAttribute);
      el.setAttribute('has-popup-menu', '');
      this.__currentPopup = showEvent.target;
      this.__currentPopupTrackElement = el;
      break;
    }
  },

  onPopupHidden(hideEvent) {
    if (!this.__currentPopup || this.__currentPopup !== hideEvent.target) {
      return;
    }
    const element = this.__currentPopupTrackElement;
    if (document.getElementById('main-window').matches(':hover')) {
      element.removeAttribute('has-popup-menu');
    } else {
      this.__removeHasPopupAttribute = () => element.removeAttribute('has-popup-menu');
      document.addEventListener('mousemove', this.__removeHasPopupAttribute, { once: true });
    }
    this.__currentPopup = null;
    this.__currentPopupTrackElement = null;
  },
};

var gZenVerticalTabsManager = {
  init() {
    var updateEvent = this._updateEvent.bind(this);
    Services.prefs.addObserver('zen.tabs.vertical.right-side', updateEvent);
    Services.prefs.addObserver('zen.view.sidebar-expanded.max-width', updateEvent);

    gZenCompactModeManager.addEventListener(updateEvent);
    this._updateEvent();
    this.initRightSideOrderContextMenu();

    const tabs = document.getElementById('tabbrowser-tabs');

    XPCOMUtils.defineLazyPreferenceGetter(this, 'canOpenTabOnMiddleClick', 'zen.tabs.newtab-on-middle-click', true);

    if (tabs) {
      tabs.addEventListener('mouseup', this.openNewTabOnTabsMiddleClick.bind(this));
    }
  },

  openNewTabOnTabsMiddleClick(event) {
    if (event.button === 1 && event.target.id === 'tabbrowser-tabs' && this.canOpenTabOnMiddleClick) {
      document.getElementById('cmd_newNavigatorTabNoEvent').doCommand();
      event.stopPropagation();
      event.preventDefault();
    }
  },

  get navigatorToolbox() {
    if (this._navigatorToolbox) {
      return this._navigatorToolbox;
    }
    this._navigatorToolbox = document.getElementById('navigator-toolbox');
    return this._navigatorToolbox;
  },

  initRightSideOrderContextMenu() {
    const kConfigKey = 'zen.tabs.vertical.right-side';
    const fragment = window.MozXULElement.parseXULToFragment(`
      <menuitem id="zen-toolbar-context-tabs-right"
                type="checkbox"
                ${Services.prefs.getBoolPref(kConfigKey) ? 'checked="true"' : ''}
                data-lazy-l10n-id="zen-toolbar-context-tabs-right"
                oncommand="gZenVerticalTabsManager.toggleTabsOnRight();"
        />
    `);
    document.getElementById('viewToolbarsMenuSeparator').before(fragment);
  },

  get isWindowsStyledButtons() {
    return !(window.AppConstants.platform === 'macosx'|| window.matchMedia('(-moz-gtk-csd-reversed-placement)').matches);
  },

  _updateEvent() {
    this._updateMaxWidth();
    const topButtons = document.getElementById('zen-sidebar-top-buttons');
    const customizationTarget = document.getElementById('nav-bar-customization-target');

    if (Services.prefs.getBoolPref('zen.tabs.vertical.right-side')) {
      this.navigatorToolbox.setAttribute('zen-right-side', 'true');
    } else {
      this.navigatorToolbox.removeAttribute('zen-right-side');
    }

    // Check if the sidebar is in hover mode
    if (
      !this.navigatorToolbox.hasAttribute('zen-right-side') &&
      !Services.prefs.getBoolPref('zen.view.compact')
    ) {
      this.navigatorToolbox.prepend(topButtons);
    //  browser.prepend(this.navigatorToolbox);
    } else {
      customizationTarget.prepend(topButtons);
    //  tabboxWrapper.prepend(this.navigatorToolbox);
    }

    if (Services.prefs.getBoolPref('zen.view.use-single-toolbar')) {
      if (!topButtons.contains(document.getElementById('nav-bar'))) {
        topButtons.after(document.getElementById('nav-bar'));
      }
      let elements = document.querySelectorAll('#nav-bar-customization-target > *:is(toolbarbutton, #stop-reload-button)');
      elements = Array.from(elements);
      const buttonsTarget = document.getElementById('zen-sidebar-top-buttons-customization-target');
      for (const button of elements) {
        buttonsTarget.append(button);
      }
      topButtons.appendChild(document.getElementById('PanelUI-button'));
      if (this.isWindowsStyledButtons) {
        document.getElementById('zen-appcontent-navbar-container').append(
          document.querySelector('#nav-bar > .titlebar-buttonbox-container')
        );
      }
    }
    
    // Always move the splitter next to the sidebar
    this.navigatorToolbox.after(document.getElementById('zen-sidebar-splitter'));
  },

  _updateMaxWidth() {
    const isCompactMode = Services.prefs.getBoolPref('zen.view.compact');
    const maxWidth = Services.prefs.getIntPref('zen.view.sidebar-expanded.max-width');
    const toolbox = document.getElementById('navigator-toolbox');
    if (!isCompactMode) {
      toolbox.style.maxWidth = `${maxWidth}px`;
    } else {
      toolbox.style.removeProperty('maxWidth');
    }
  },

  get expandButton() {
    if (this._expandButton) {
      return this._expandButton;
    }
    this._expandButton = document.getElementById('zen-expand-sidebar-button');
    return this._expandButton;
  },

  toggleTabsOnRight() {
    const newVal = !Services.prefs.getBoolPref('zen.tabs.vertical.right-side');
    Services.prefs.setBoolPref('zen.tabs.vertical.right-side', newVal);
  },
};