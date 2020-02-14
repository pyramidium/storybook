import React, { Fragment, FunctionComponent, useMemo, useEffect } from 'react';
import merge from '@storybook/api/dist/lib/merge';
import { Helmet } from 'react-helmet-async';

import { API, Consumer, Combo } from '@storybook/api';
import { SET_CURRENT_STORY } from '@storybook/core-events';
import addons, { types, Addon } from '@storybook/addons';

import { Loader } from '@storybook/components';
import { Location } from '@storybook/router';

import * as S from './utils/components';
import { ZoomProvider, ZoomConsumer } from './tools/zoom';
import { defaultWrappers, ApplyWrappers } from './wrappers';
import { ToolbarComp } from './toolbar';
import { FramesRenderer } from './FramesRenderer';

import { PreviewProps } from './utils/types';

const getWrappers = (getFn: API['getElements']) => Object.values(getFn<Addon>(types.PREVIEW));
const getTabs = (getFn: API['getElements']) => Object.values(getFn<Addon>(types.TAB));

const canvasMapper = ({ state, api }: Combo) => ({
  storyId: state.storyId,
  viewMode: state.viewMode,
  customCanvas: api.renderPreview,
  queryParams: state.customQueryParams,
  getElements: api.getElements,
  story: api.getData(state.storyId),
  refs: state.refs,
});

const createCanvas = (id: string, baseUrl = 'iframe.html', withLoader = true): Addon => ({
  id: 'canvas',
  title: 'Canvas',
  route: ({ storyId }) => `/story/${storyId}`,
  match: ({ viewMode }) => !!(viewMode && viewMode.match(/^(story|docs)$/)),
  render: ({ active, key }) => {
    return (
      <Consumer filter={canvasMapper} key={key}>
        {({ story, refs, customCanvas, storyId, viewMode, queryParams, getElements }) => {
          const wrappers = useMemo(() => [...defaultWrappers, ...getWrappers(getElements)], [
            getElements,
            ...defaultWrappers,
          ]);

          const isLoading =
            (storyId && !story) || (story && story.refId && !refs[story.refId].startInjected);

          return (
            <ZoomConsumer>
              {({ value: scale }) => {
                const content = customCanvas ? (
                  customCanvas(storyId, viewMode, id, baseUrl, scale, queryParams)
                ) : (
                  <FramesRenderer
                    refs={refs}
                    scale={scale}
                    story={story}
                    viewMode={viewMode}
                    queryParams={queryParams}
                    storyId={storyId}
                  />
                );

                return (
                  <>
                    {withLoader && isLoading && <Loader id="preview-loader" role="progressbar" />}
                    <ApplyWrappers
                      id={id}
                      storyId={storyId}
                      viewMode={viewMode}
                      active={active}
                      wrappers={wrappers}
                    >
                      {content}
                    </ApplyWrappers>
                  </>
                );
              }}
            </ZoomConsumer>
          );
        }}
      </Consumer>
    );
  },
});

const useTabs = (
  id: PreviewProps['id'],
  baseUrl: PreviewProps['baseUrl'],
  withLoader: PreviewProps['withLoader'],
  getElements: API['getElements'],
  story: PreviewProps['story']
) => {
  const canvas = useMemo(() => {
    return createCanvas(id, baseUrl, withLoader);
  }, [id, baseUrl, withLoader]);

  const tabsFromConfig = useMemo(() => {
    return getTabs(getElements);
  }, [getElements]);

  return useMemo(() => {
    if (story && story.parameters) {
      return filterTabs([canvas, ...tabsFromConfig], story.parameters);
    }

    return [canvas, ...tabsFromConfig];
  }, [story, canvas, ...tabsFromConfig]);
};

const Preview: FunctionComponent<PreviewProps> = props => {
  const {
    api,
    id,
    options,
    viewMode,
    story = undefined,
    description,
    baseUrl = 'iframe.html',
    withLoader = true,
  } = props;
  const { isToolshown } = options;
  const { getElements } = api;

  const tabs = useTabs(id, baseUrl, withLoader, getElements, story);

  useEffect(() => {
    if (story) {
      api.emit(SET_CURRENT_STORY, {
        storyId: story.knownAs || story.id,
        viewMode,
        options: { target: story.refId },
      });
    }
  }, [story, viewMode]);

  return (
    <Fragment>
      {id === 'main' && (
        <Helmet key="description">
          <title>{description}</title>
        </Helmet>
      )}
      <ZoomProvider>
        <ToolbarComp key="tools" story={story} api={api} isShown={isToolshown} tabs={tabs} />
        <S.FrameWrap key="frame" offset={isToolshown ? 40 : 0}>
          {tabs.map(({ render: Render, match, ...t }, i) => {
            // @ts-ignore
            const key = t.id || t.key || i;
            return (
              <Fragment key={key}>
                <Location>{lp => <Render active={match(lp)} />}</Location>
              </Fragment>
            );
          })}
        </S.FrameWrap>
      </ZoomProvider>
    </Fragment>
  );
};

export { Preview };

function filterTabs(panels: Addon[], parameters: Record<string, any>) {
  const { previewTabs } = addons.getConfig();
  const parametersTabs = parameters ? parameters.previewTabs : undefined;

  if (previewTabs || parametersTabs) {
    // deep merge global and local settings
    const tabs = merge(previewTabs, parametersTabs);
    const arrTabs = Object.keys(tabs).map((key, index) => ({
      index,
      ...(typeof tabs[key] === 'string' ? { title: tabs[key] } : tabs[key]),
      id: key,
    }));
    return panels
      .filter(panel => {
        const t = arrTabs.find(tab => tab.id === panel.id);
        return t === undefined || t.id === 'canvas' || !t.hidden;
      })
      .map((panel, index) => ({ ...panel, index } as Addon))
      .sort((p1, p2) => {
        const tab_1 = arrTabs.find(tab => tab.id === p1.id);
        // @ts-ignore
        const index_1 = tab_1 ? tab_1.index : arrTabs.length + p1.index;
        const tab_2 = arrTabs.find(tab => tab.id === p2.id);
        // @ts-ignore
        const index_2 = tab_2 ? tab_2.index : arrTabs.length + p2.index;
        return index_1 - index_2;
      })
      .map(panel => {
        const t = arrTabs.find(tab => tab.id === panel.id);
        if (t) {
          return {
            ...panel,
            title: t.title || panel.title,
            disabled: t.disabled,
            hidden: t.hidden,
          } as Addon;
        }
        return panel;
      });
  }
  return panels;
}