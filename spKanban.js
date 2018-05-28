/*eslint-disable*/
import React, { Component } from 'react';
import { observer, inject } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Row, Col, Card, Spin, Select, Form, Avatar } from 'antd';
import 'material-design-icons/iconfont/material-icons.css';
import _ from 'lodash';
import Cookies from 'universal-cookie';
import Field from '../../../components/Charts/Field';
import ChartCard from '../../../components/Charts/ChartCard';
import MiniProgress from '../../../components/Charts/MiniProgress';
import '../../../components/Charts/Report.less';
import LegendDownPie from '../../../components/Charts/LegendDownPie';
import LineGroupBar from '../../../components/Charts/LineGroupBar';
import { fullscreen } from '../../../common/utils';
import HitsmPageHeader, { HitsmPageHeadStyle } from '../../../components/HitsmPageHeader';

const Option = Select.Option;
const FormItem = Form.Item;

const dateFormat = 'YYYY-MM-DD HH:mm:ss';
const { Meta } = Card;

@inject('AppState')
@observer
class spReport extends Component {
  static contextTypes = {
    collapse: PropTypes.bool,
  };
  constructor(props) {
    super(props);
    this.orderTitleMap = [
      HAP.getMessage('单量', 'amount'),
      HAP.getMessage('处理中', 'processing'),
    ];
    this.titleMap = [
      HAP.getMessage('新建', 'created'),
      HAP.getMessage('关闭', 'closed'),
    ];
    this.state = {
      lockReconnect: false,
      select: false,
      selectSee: true,
      dataSituation: [],
      dataClassify: [],
      totalOrder: 0,
      dataPriority: [],
      amount: 0,
      realTimeOrder: 0,
      eventResponse: 0,
      todayOrderAmount: 0,
      handleTopFirst: [],
      handleTopSecond: [],
      handleTopThird: [],
      topFirstDefault: '',
      topSecondDefault: '',
      topThirdDefault: '',
      topFirstTitle: '',
      topSecondTitle: '',
      topThirdTitle: '',
      groupOptions: [],
      groupId: [],
      ws: {},
      heartCheck: {},
    };
  }
  componentDidMount() {
    const {ReportStore, AppState} = this.props;
    const projectId = AppState.currentMenuType.id;
    const orgId = AppState.currentMenuType.organizationId;
    let projects = {};
    projects[projectId] = orgId;
    this.setState({
      project: projectId,
      projects,
    });
    const userId = AppState.user.id;
    // document.addEventListener('fullscreenchange', this.fullscreenListener);

    window.onresize = () => {
      const { select } = this.state;
      if (select) {
        //要执行的动作
        this.setState({
          select: false,
          selectSee: false
        });
      } else {
        this.setState({
          selectSee: true
        });
      }
    };
    // 定时器
    this.heartCheck();

    ReportStore.queryUserInfo(projectId, userId).then((data) => {
      if (data && data.roles) {
        const roleNames = [];
        data.roles.forEach((role) => {
          roleNames.push(role.roleName);
        });
        if (roleNames.length) {
          if (roleNames.includes('role/hitsm-event-service.platformAdmin')) {
            this.loadProjects();
            this.loadService(projectId, orgId, 'all');
          } else if (roleNames.includes('role/hitsm-event-service.userAdmin')) {
            this.loadService(projectId, orgId, 'all');
          } else if (roleNames.includes('role/hitsm-event-service.operateCommissioner')) {
            this.loadService(projectId, orgId);
          }
        }
      }
    });
  }

  componentWillUnmount() {
    const { ws } = this.state;
    this.setState({ lockReconnect: true }, () => {
      ws.close();
    });
  }

  loadFullscreen = (e) => {
    let select = fullscreen(e);
    this.setState ({
      select
    });
  };


  loadProjects = () => {
    const { ReportStore } = this.props;
    ReportStore.queryAllProjects().then((data) => {
      if (data) {
        const projectOptions = [];
        const projects = {};
        data.forEach((item) => {
          projects[item.id] = item.organizationId;
          projectOptions.push(
            <Option value={item.id} key={item.name}>{item.name}</Option>
          );
        });
        this.setState({
          projectOptions,
          projects,
        });
      }
    });
  };

  loadService = (projectId, orgId, type) => {
    const { AppState } = this.props;
    const userId = AppState.user.id;
    if (type === 'all') {
      this.loadChartData(projectId, null);
    }
  };

  createWebSocket = (groupId) => {
    let ws = null;
    const server = 'ws.hitsm.cloud.saas.hand-china.com';
    // const server = '10.211.103.156:8050';
    const cookies = new Cookies();
    const accessToken = cookies.get(HAP.ACCESS_TOKEN);
    const url = `ws://${server}/websocket?token=${accessToken}`;
    const { heartCheck } = this.state;
    try {
      ws = new WebSocket(url);
      ws.onclose = () => {
        this.reconnect();
      };
      ws.onerror = () => {
        // this.reconnect();
      };
      ws.onopen = () => {
        //心跳检测重置
        const {AppState} = this.props;
        const projectId = AppState.currentMenuType.id;
        heartCheck.reset();
        heartCheck.start();
        // console.log('open执行');
        let chartList = JSON.stringify({
          groupId: groupId,
          projectId: projectId
        });
        // console.log(chartList);
        ws.send(chartList);
      };
      ws.onmessage = (e) => {
        //如果获取到消息，心跳检测重置
        //拿到任何消息都说明当前连接是正常的
        // console.log(e.data);
        if (e.data !== 'H&M') {
          this.dataDistribution(e);
        }
        heartCheck.reset();
        heartCheck.start();
        // console.log('执行');
      }
    } catch (e) {
      // this.reconnect();
    }
    this.setState({ ws });
  };

  reconnect = () => {
    const that = this;
    const { lockReconnect } = this.state;
    if(lockReconnect) return;
    this.setState({ lockReconnect: true });
    //没连接上会一直重连，设置延迟避免请求过多
    setTimeout( () => {
      const { groupId } = this.state;
      that.createWebSocket(groupId);
      that.setState({ lockReconnect: false });
    }, 10000);
  };

  heartCheck = () => {
    const that = this;
    const heartCheck = {
      timeout: 30000,//30秒
      timeoutObj: null,
      serverTimeoutObj: null,
      reset: function(){
        clearTimeout(this.timeoutObj);
        clearTimeout(this.serverTimeoutObj);
        return this;
      },
      start: function(){
        const self = this;
        this.timeoutObj = setTimeout(function(){
          //这里发送一个心跳，后端收到后，返回一个心跳消息，
          //onmessage拿到返回的心跳就说明连接正常
          const { ws } = that.state;
          ws.send("H&M");
          // console.log('start执行');
          self.serverTimeoutObj = setTimeout(function(){
            //如果超过一定时间还没重置，说明后端主动断开了
            ws.close();
            that.setState({ lockReconnect: true })
            // console.log('关闭');
          }, self.timeout)
        }, this.timeout)
      }
    };
    this.setState({ heartCheck })
  };

  loadChartData = (projectId, serviceId) => {
    this.getAllGroups(projectId);
  };


  dataDistribution = (e) => {
    const chartData = JSON.parse(e.data);
    // console.log(chartData);
    if (chartData.actualEvent.realTime) {
      const realTimeOrder = parseInt(chartData.actualEvent.realTime); // 加载实时新建事件单
      this.setState({
        realTimeOrder,
      })
    }
    if (chartData.actualEvent.todayCount) {
      const todayOrderAmount = parseInt(chartData.actualEvent.todayCount); // 加载今日新建事件单
      this.setState({
        todayOrderAmount,
      })
    }
    if (chartData.eventResponse) {
      let eventResponse = parseInt(chartData.eventResponse); // 加载今日新建事件单
      if (eventResponse >= 100) { eventResponse = 100; }
      this.setState({
        eventResponse,
      })
    }
    // 加载今日事件单分类占比
    if (chartData.classifyList) {
      const dataClassify = [];
      let totalOrder = 0;
      chartData.classifyList.forEach((item, index) => {
        if (index === chartData.classifyList.length - 1) {
          totalOrder = item.todayCount;
        } else {
          let temporary = {
            y: item.count,
            x: item.classify
          };
          dataClassify.push(temporary);
        }
      });
      this.setState({
        dataClassify: dataClassify,
        totalOrder: totalOrder,
      })
    }
    // 加载今日事件单情况
    if (chartData.situationList) {
      const dataSituation = [];
      const created = HAP.getMessage('新建', 'created');
      // const processing = HAP.getMessage('正在解决', 'processing');
      const closed = HAP.getMessage('关闭', 'closed');
      chartData.situationList.forEach((item, index) => {
        let temporary = {
          time: item.time,
          processing: item.processing,
        };
        temporary[created] = item.created;
        temporary[closed] = item.closed;
        dataSituation.push(temporary);
      });
      this.setState({
        dataSituation: dataSituation,
      })
    }
    // 加载今日事件单优先级占比
    if (chartData.priorityList) {
      const dataPriority = [];
      let amount = 0;
      chartData.priorityList.forEach((item, index) => {
        if (index === chartData.priorityList.length - 1) {
          amount = item.amount;
        } else {
          let temporary = {
            y: item.count,
            x: item.priority
          };
          dataPriority.push(temporary);
        }
      });
      this.setState({
        dataPriority: dataPriority,
        amount: amount,
      })
    }
    if (chartData.groupList[0]) {
      let handleTopFirst = [];
      _.forEach(chartData.groupList[0], (item, index) => {
        index = parseInt(index) + 1;
        handleTopFirst.push(
          <Row style={{marginBottom: 20}} gutter={10} type="flex" justify="space-around" align="middle">
            <div style={{ width: '33%', textAlign: 'center' }}>
              <Avatar style={index<=3 ? { color: '#ffffff', backgroundColor: '#314659' } : { color: '#000000', backgroundColor: '#F0F2F5' }} size="small">{index}</Avatar>
            </div>
            <p style={{ width: '33%', textAlign: 'center' }}>{item.name}</p>
            <p style={{ width: '33%', textAlign: 'center' }}>{item.count}</p>
          </Row>
        );
      });
      this.setState({
        handleTopFirst: handleTopFirst
      });

    }
    if (chartData.groupList[1]) {
      let handleTopSecond = [];
      _.forEach(chartData.groupList[1], (item, index) => {
        index = parseInt(index) + 1;
        handleTopSecond.push(
          <Row style={{marginBottom: 20}} gutter={10} type="flex" justify="space-around" align="middle">
            <div style={{ width: '33%', textAlign: 'center' }}>
              <Avatar style={index<=3 ? { color: '#ffffff', backgroundColor: '#314659' } : { color: '#000000', backgroundColor: '#F0F2F5' }} size="small">{index}</Avatar>
            </div>
            <p style={{ width: '33%', textAlign: 'center' }}>{item.name}</p>
            <p style={{ width: '33%', textAlign: 'center' }}>{item.count}</p>
          </Row>
        );
      });
      this.setState({
        handleTopSecond: handleTopSecond
      });
    }
    if (chartData.groupList[2]) {
      let handleTopThird = [];
      _.forEach(chartData.groupList[2], (item, index) => {
        index = parseInt(index) + 1;
        handleTopThird.push(
          <Row style={{marginBottom: 20}} gutter={10} type="flex" justify="space-around" align="middle">
            <div style={{ width: '33%', textAlign: 'center' }}>
              <Avatar style={index<=3 ? { color: '#ffffff', backgroundColor: '#314659' } : { color: '#000000', backgroundColor: '#F0F2F5' }} size="small">{index}</Avatar>
            </div>
            <p style={{ width: '33%', textAlign: 'center' }}>{item.name}</p>
            <p style={{ width: '33%', textAlign: 'center' }}>{item.count}</p>
          </Row>
        );
      });
      this.setState({
        handleTopThird: handleTopThird
      });
    }
  };

  checkPermission = () => {
    let pass = false;
    const {ReportStore} = this.props;
    const roles = ReportStore.user ? ReportStore.user.roles : '';
    if (roles) {
      roles.forEach((item) => {
        if (item.roleName === 'role/hitsm-event-service.platformAdmin') {
          pass = true;
        }
      });
    }
    return pass;
  };

  getAllGroups = (projectId) => {
    const { ReportStore, AppState } = this.props;
    let groupOptions = [];
    let groupId = [];
    ReportStore.getAllGroups(projectId).then(() => {

      _.forEach(ReportStore.getGroups, item => {
        groupOptions.push(<Option value={item.id}>
          {item.name}
        </Option>);
      });
      if (ReportStore.getGroups[0]) {
        groupId.push(ReportStore.getGroups[0].id);
        this.setState({
          topFirstDefault: ReportStore.getGroups[0].id,
          topFirstTitle: ReportStore.getGroups[0].name,
        })
      }

      if (ReportStore.getGroups[1]) {
        groupId.push(ReportStore.getGroups[1].id);
        this.setState({
          topSecondDefault: ReportStore.getGroups[1].id,
          topSecondTitle: ReportStore.getGroups[1].name,
        })
      }

      if (ReportStore.getGroups[2]) {
        groupId.push(ReportStore.getGroups[2].id);
        this.setState({
          topThirdDefault: ReportStore.getGroups[2].id,
          topThirdTitle: ReportStore.getGroups[2].name,
        })
      }

      this.setState({
        groupOptions: groupOptions,
        groupId: groupId,
        loading: false,
        threadLoading: false
      }, () => {
        this.createWebSocket(groupId);
        // console.log('创建');
      } );
    });
  };
  handleServiceChangeFirst = (value) => {
    const { ws, groupId } = this.state;
    groupId[0] = value.key;
    let groupList = JSON.stringify({
      groupId: groupId
    });
    ws.send(groupList);
    this.setState({
      topFirstTitle: value.label
    })
  };
  handleServiceChangeSecond = (value) => {
    const { ws,groupId } = this.state;
    groupId[1] = value.key;
    let groupList = JSON.stringify({
      groupId: groupId
    });
    ws.send(groupList);
    this.setState({
      topSecondTitle: value.label
    })
  };
  handleServiceChangeThird = (value) => {
    const { ws, groupId } = this.state;
    groupId[2] = value.key;
    let groupList = JSON.stringify({
      groupId: groupId
    });
    ws.send(groupList);
    this.setState({
      topThirdTitle: value.label
    })
  };

  render() {
    const {
      selectSee,
      loading,
      threadLoading,
      serviceId,
      dataSituation,
      eventResponse,
      dataClassify,
      totalOrder,
      dataPriority,
      amount,
      realTimeOrder,
      todayOrderAmount,
      handleTopFirst,
      handleTopSecond,
      handleTopThird,
      topFirstDefault,
      topSecondDefault,
      topThirdDefault,
      topFirstTitle,
      topSecondTitle,
      topThirdTitle,
      groupOptions,
    } = this.state;

    const loadingBar = (
      <div style={{ display: 'inherit', margin: '200px auto', textAlign: 'center' }}>
        <Spin />
      </div>
    );

    const footerStyle = {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: '100%',
      height: 45,
      lineHeight: 4,
      background: '#fff',
      borderTop: '1px solid #e9e9e9',
      padding: '0 17px',
      borderRadius: '2px 2px 0 0',
      zoom: 1,
      marginBottom: -1,
      display: 'flex',
    };

    return (
      <div>
        <HitsmPageHeader
          title="report.spKanban"
          children={
            <div style={{ display: 'inline-block', verticalAlign: 'top', lineHeight: '28px', fontSize: 14, marginRight: 30 }}>
              <i className="material-icons" style={{ color: '#2196F3', lineHeight: 2.2, fontWeight: 700 }} onClick={() => this.loadFullscreen("full")} role="button" >crop_free</i>
            </div>
          }
          className="cloopm-report-header"
          style={{ left: this.context.collapse ? '61px' : '254px', width: this.context.collapse ? 'calc(100vw - 61px)' : 'calc(100vw - 254px)', minWidth: 'initial' }}
        />
        {loading ? loadingBar :
          <div id="full" style={{ ...HitsmPageHeadStyle.mainStyle, height: 'calc(100% - 113px)', marginTop: 64 }}>
            <div style={{ ...HitsmPageHeadStyle.innerStyle, backgroundColor: '#ECEFF3', padding: 0, overflow: 'hidden' }}>
              <Row gutter={10}>
                <Col xl={12} lg={12} md={12} sm={24} xs={24}>
                  <Card
                    loading={threadLoading}
                    bordered={false}
                    style={{ minHeight: 'calc(50vh - 72px)' }}
                    title={HAP.languageChange('report.todayEventOrder')}
                  >
                    <div className="salesCard" style={{ minHeight: 300 }}>
                      {dataSituation && dataSituation.length ?
                        <LineGroupBar
                          data={dataSituation}
                          titleMap={this.titleMap}
                          axisTitle={this.orderTitleMap}
                          color={['#2FC25B', '#1890FF']}
                          lineColor={'#FACC14'}
                          height={300}
                        /> :
                        <span style={{ display: 'block', textAlign: 'center' }}>{HAP.languageChange('report.empty')}</span>
                      }
                    </div>
                  </Card>
                </Col>
                <Col xl={6} lg={6} md={6} sm={12} xs={24}>
                  <div style={{ minHeight: 'calc(50vh - 72px)', display: 'flex', flexFlow: 'column' }}>
                    <Card
                      loading={threadLoading}
                      bordered={false}
                      style={{ flex: 1, background: '#F7F7F7', height: '240px'}}
                      title={HAP.languageChange('report.realTimeOrder')}
                    >
                      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9vh', color: '#EF2A26', width: '100%', height: '100%'}}>
                        <p style={{ width: '100%', textAlign: 'center' }}>{realTimeOrder}</p>
                      </div>
                      <div style={footerStyle}>
                        <Field label={HAP.languageChange('report.todayCreateOrder')} value={todayOrderAmount}/>
                      </div>
                    </Card>

                    <ChartCard
                      title={HAP.languageChange('report.orderResponseRate')}
                      total={`${eventResponse}%`}
                      contentHeight={31}
                      style={{ height: '144.5px', marginTop: 10, border: 'none' }}
                    >
                      <MiniProgress percent={eventResponse} strokeWidth={8} target={90} />
                    </ChartCard>
                  </div>
                </Col>
                <Col xl={6} lg={6} md={6} sm={12} xs={24}>
                  <Card
                    loading={threadLoading}
                    bordered={false}
                    style={{ minHeight: 'calc(50vh - 72px)' }}
                    title={HAP.languageChange('report.todayOrderClassify')}
                  >
                    <div className="salesCard" style={{ minHeight: 300 }}>
                      {dataClassify && dataClassify.length ?
                        <LegendDownPie
                          hasLegend
                          subTitle={HAP.languageChange('report.todayOrderNum')}
                          total={totalOrder}
                          data={dataClassify}
                          colors={['#1890FF', '#13C2C2', '#2FC25B', '#FACC14', '#F04864', '#8543E0']}
                          height={220}
                        /> :
                        <span style={{ display: 'block', textAlign: 'center' }}>{HAP.languageChange('report.empty')}</span>
                      }
                    </div>
                  </Card>
                </Col>
              </Row>
              <Row gutter={10}>
                <Col xl={18} lg={18} md={18} sm={24} xs={24} id="top-list">
                  <Card
                    loading={threadLoading}
                    bordered={false}
                    title={HAP.languageChange('report.todayTopList')}
                    style={{ minHeight: 'calc(50vh - 72px)', marginTop: 10 }}
                    bodyStyle={{ padding: '24px 0 0 0' }}
                  >
                    <Col xl={8} lg={8} md={8} sm={8} xs={8} style={{ minHeight: 291, borderRight: '1px solid #e8e8e8' }}>
                      {groupOptions.length >= 1 ?
                        <div>
                          <Row style={{marginBottom: 20, paddingLeft: 'calc(16.5% - 12px)'}} gutter={10}>
                            <p style={{ fontWeight: 600, fontSize: 12 }}>{topFirstTitle}{HAP.getMessage('事件单处理榜', 'Incident Handle List')}</p>
                          </Row>
                          <Row style={{marginBottom: 20, paddingLeft: 'calc(16.5% - 12px)'}} gutter={10}>
                            {selectSee ?
                              <Select
                                labelInValue
                                defaultValue={{ key: topFirstDefault }}
                                onChange={this.handleServiceChangeFirst}
                                style={{ width: 240 }}
                                getPopupContainer={() => document.getElementById('top-list')}
                              >
                                {groupOptions}
                              </Select> : ''
                            }
                            </Row>
                        </div> : ''
                      }
                      {handleTopFirst.length ? handleTopFirst : <span style={{ display: 'block', textAlign: 'center' }}>{HAP.languageChange('report.empty')}</span>}
                    </Col>
                    <Col xl={8} lg={8} md={8} sm={8} xs={8} style={{ minHeight: 291, borderRight: '1px solid #e8e8e8' }}>
                      {groupOptions.length >= 2 ?
                        <div>
                          <Row style={{marginBottom: 20, paddingLeft: 'calc(16.5% - 12px)'}} gutter={10}>
                            <p style={{ fontWeight: 600, fontSize: 12 }}>{topSecondTitle}{HAP.getMessage('事件单处理榜', 'Incident Handle List')}</p>
                          </Row>
                          <Row style={{marginBottom: 20, paddingLeft: 'calc(16.5% - 12px)'}} gutter={10} >
                            {selectSee ?
                              <Select
                                labelInValue
                                defaultValue={{ key: topSecondDefault }}
                                onChange={this.handleServiceChangeSecond}
                                style={{ width: 240 }}
                                getPopupContainer={() => document.getElementById('top-list')}
                              >
                                {groupOptions}
                              </Select> : ''
                            }
                            </Row>
                        </div> : ''
                      }
                      {handleTopSecond.length ? handleTopSecond : <span style={{ display: 'block', textAlign: 'center' }}>{HAP.languageChange('report.empty')}</span>}
                    </Col>
                    <Col xl={8} lg={8} md={8} sm={8} xs={8} style={{ minHeight: 291 }}>
                      {groupOptions.length >= 3 ?
                        <div>
                          <Row style={{marginBottom: 20, paddingLeft: 'calc(16.5% - 12px)'}} gutter={10}>
                            <p style={{ fontWeight: 600, fontSize: 12 }}>{topThirdTitle}{HAP.getMessage('事件单处理榜', 'Incident Handle List')}</p>
                          </Row>
                          <Row style={{marginBottom: 20, paddingLeft: 'calc(16.5% - 12px)'}} gutter={10}>
                            {selectSee ?
                              <Select
                                labelInValue
                                defaultValue={{ key: topThirdDefault }}
                                onChange={this.handleServiceChangeThird}
                                style={{ width: 240 }}
                                getPopupContainer={() => document.getElementById('top-list')}
                              >
                                {groupOptions}
                              </Select> : ''
                            }
                            </Row>
                        </div> : ''
                      }
                      {handleTopThird.length ? handleTopThird : <span style={{ display: 'block', textAlign: 'center' }}>{HAP.languageChange('report.empty')}</span>}
                    </Col>
                  </Card>
                </Col>
                <Col xl={6} lg={6} md={6} sm={12} xs={24}>
                  <Card
                    loading={threadLoading}
                    bordered={false}
                    style={{ minHeight: 'calc(50vh - 72px)', marginTop: 10 }}
                    title={HAP.languageChange('report.todayOrderPriority')}
                  >
                    <div className="salesCard" style={{ minHeight: 267 }}>
                      {dataPriority && dataPriority.length ?
                        <LegendDownPie
                          hasLegend
                          subTitle={HAP.languageChange('report.todayOrderNum')}
                          total={amount}
                          data={dataPriority}
                          colors={['#1890FF', '#2FC25B', '#8543E0', '#FACC14', '#F04864']}
                          height={220}
                        /> :
                        <span style={{ display: 'block', textAlign: 'center' }}>{HAP.languageChange('report.empty')}</span>
                      }
                    </div>
                  </Card>
                </Col>
              </Row>
            </div>
          </div>
        }
      </div>
    );
  }
}

export default Form.create({})(withRouter(spReport));

