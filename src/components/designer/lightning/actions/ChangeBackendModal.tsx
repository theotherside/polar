import React from 'react';
import { useAsyncCallback } from 'react-async-hook';
import styled from '@emotion/styled';
import { Col, Form, Icon, Modal, Row, Select } from 'antd';
import { FormComponentProps } from 'antd/lib/form';
import { usePrefixedTranslation } from 'hooks';
import { Status } from 'shared/types';
import { useStoreActions, useStoreState } from 'store';
import { Network } from 'types';
import LightningNodeSelect from 'components/common/form/LightningNodeSelect';

const Styled = {
  IconCol: styled(Col)`
    display: flex;
    justify-content: center;
    align-items: center;
  `,
  Restart: styled.p`
    font-style: italic;
    opacity: 0.6;
  `,
};

interface FormFields {
  lnNode?: string;
  backendNode?: string;
}

interface Props extends FormComponentProps<FormFields> {
  network: Network;
}

const ChangeBackendModal: React.FC<Props> = ({ network, form }) => {
  const { l } = usePrefixedTranslation(
    'cmps.designer.lightning.actions.ChangeBackendModal',
  );
  const { visible, lnName, backendName } = useStoreState(s => s.modals.changeBackend);
  const { hideChangeBackend } = useStoreActions(s => s.modals);
  const { updateBackendNode } = useStoreActions(s => s.network);
  const { notify } = useStoreActions(s => s.app);

  const changeAsync = useAsyncCallback(async (ln: string, backend: string) => {
    try {
      await updateBackendNode({
        id: network.id,
        lnName: ln,
        backendName: backend,
      });
      notify({
        message: l('successTitle'),
        description: l('successDesc', { ln, backend }),
      });
      hideChangeBackend();
    } catch (error) {
      notify({ message: l('submitError'), error });
    }
  });

  const handleSubmit = () => {
    form.validateFields((err, values: FormFields) => {
      if (err) return;

      const { lightning, bitcoin } = network.nodes;
      const ln = lightning.find(n => n.name === values.lnNode);
      const backend = bitcoin.find(n => n.name === values.backendNode);
      if (!ln || !backend) return;
      changeAsync.execute(ln.name, backend.name);
    });
  };

  return (
    <>
      <Modal
        title={l('title')}
        visible={visible}
        onCancel={() => hideChangeBackend()}
        destroyOnClose
        cancelText={l('cancelBtn')}
        okText={l('okBtn')}
        okButtonProps={{
          loading: changeAsync.loading,
        }}
        onOk={handleSubmit}
      >
        <p>{l('description')}</p>
        <Form hideRequiredMark colon={false}>
          <Row type="flex" gutter={16}>
            <Col span={10}>
              <LightningNodeSelect
                network={network}
                id="lnNode"
                form={form}
                label={l('lnNodeLabel')}
                disabled={changeAsync.loading}
                initialValue={lnName}
              />
            </Col>
            <Styled.IconCol span={4}>
              <Icon type="swap" style={{ fontSize: '2em', opacity: 0.5 }} />
            </Styled.IconCol>
            <Col span={10}>
              <Form.Item label={l('backendNodeLabel')}>
                {form.getFieldDecorator('backendNode', {
                  initialValue: backendName,
                  rules: [{ required: true, message: l('cmps.forms.required') }],
                })(
                  <Select disabled={changeAsync.loading}>
                    {network.nodes.bitcoin.map(node => (
                      <Select.Option key={node.name} value={node.name}>
                        {node.name}
                      </Select.Option>
                    ))}
                  </Select>,
                )}
              </Form.Item>
            </Col>
          </Row>
          {network.status === Status.Started && (
            <Styled.Restart>
              {l('restartNotice', { name: form.getFieldValue('lnNode') })}
            </Styled.Restart>
          )}
        </Form>
      </Modal>
    </>
  );
};

export default Form.create<Props>()(ChangeBackendModal);