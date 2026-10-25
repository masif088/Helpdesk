'use client'

import { CopyOutlined, DeleteOutlined, KeyOutlined, MailOutlined, PhoneOutlined, PlusOutlined,UploadOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Card, Col, Divider, Form, Input, Layout, message, Popconfirm,Row, Select, Space, Tag, Typography, Upload } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect,useState } from 'react'

import AdminMainColumn from '@/components/layout/AdminMainColumn'
import AdminSidebar from '@/components/layout/AdminSidebar'
import MyApiKeys from '@/components/profile/MyApiKeys'
import { useSession } from '@/lib/auth-client'
import { USER_DEPARTMENTS, USER_POSITIONS } from '@/lib/user-work-dropdowns'
import { uploadAvatar } from '@/utils/storage'

const { Content } = Layout
const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

type SessionUser = {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  user_metadata?: { full_name?: string | null; avatar_url?: string | null }
}

interface ProfileContentProps {
  user: SessionUser
  userData?: {
    first_name?: string | null
    last_name?: string | null
    full_name?: string | null
    avatar_url?: string | null
    phone?: string | null
    department?: string | null
    position?: string | null
    bio?: string | null
    timezone?: string
    locale?: string
  }
}

interface ApiToken {
  id: string
  token: string
  name: string
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export default function ProfileContent({ user, userData }: ProfileContentProps) {
  const router = useRouter()
  const { update: updateSession, data: clientSession } = useSession()
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userData?.avatar_url || user.user_metadata?.avatar_url || null)
  const [form] = Form.useForm()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)

  useEffect(() => {
    if (userData) {
      form.setFieldsValue({
        email: user.email,
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        full_name: userData.full_name || user.user_metadata?.full_name || '',
        phone: userData.phone || '',
        department: userData.department || '',
        position: userData.position || '',
        bio: userData.bio || '',
        timezone: userData.timezone || 'UTC',
        locale: userData.locale || 'en',
      })
      setAvatarUrl(userData.avatar_url || user.user_metadata?.avatar_url || null)
    }
  }, [userData, form, user])

  const fetchTokens = async () => {
    setLoadingTokens(true)
    try {
      const res = await fetch('/api/auth/tokens')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tokens')
      setTokens(data.tokens || [])
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to fetch tokens')
    } finally {
      setLoadingTokens(false)
    }
  }

  useEffect(() => {
    fetchTokens()
  }, [user.id])

  // Generate new token
  const handleGenerateToken = async () => {
    setGeneratingToken(true)
    try {
      const response = await fetch('/api/auth/token/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Chrome Extension' }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate token')
      }

      setNewToken(result.token)
      message.success('Token generated successfully! Copy it now - it won\'t be shown again.')
      fetchTokens()
    } catch (error: any) {
      message.error(error.message || 'Failed to generate token')
    } finally {
      setGeneratingToken(false)
    }
  }

  const handleDeleteToken = async (tokenId: string) => {
    try {
      const res = await fetch(`/api/auth/tokens/${tokenId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete token')
      message.success('Token deleted successfully')
      fetchTokens()
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to delete token')
    }
  }

  // Copy token to clipboard
  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token)
    message.success('Token copied to clipboard!')
  }

  const handleAvatarUpload = async (file: File) => {
    setUploading(true)
    try {
      const result = await uploadAvatar(file, user.id)
      if (result.error || !result.url) {
        message.error(result.error || 'Failed to upload avatar. Please check storage bucket permissions.')
        return
      }
      setAvatarUrl(result.url)

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: result.url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile')
      message.success('Avatar uploaded successfully!')
      await updateSession({})
      router.refresh()
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to upload avatar')
    } finally {
      setUploading(false)
    }
  }

  const onFinish = async (values: {
    full_name?: string
    first_name?: string
    last_name?: string
    phone?: string
    department?: string
    position?: string
    bio?: string
    timezone?: string
    locale?: string
  }) => {
    setLoading(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: values.full_name,
          first_name: values.first_name || null,
          last_name: values.last_name || null,
          avatar_url: avatarUrl,
          phone: values.phone,
          department: values.department,
          position: values.position,
          bio: values.bio,
          timezone: values.timezone || 'UTC',
          locale: values.locale || 'en',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update profile')
      message.success('Profile updated successfully!')
      await updateSession({})
      router.refresh()
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AdminSidebar user={user} collapsed={collapsed} onCollapse={setCollapsed} />
      
      <AdminMainColumn collapsed={collapsed} user={{ id: user.id }}>
        <Content style={{ padding: '24px', background: 'var(--layout-bg)', minHeight: '100vh' }}>
          <Card>
            <Title level={2}>Edit Profile</Title>
            <Text type="secondary">Update your profile information</Text>

            <div style={{ marginTop: 32, marginBottom: 32, textAlign: 'center' }}>
              <Space orientation="vertical" size="large">
                <div>
                  <Avatar
                    size={100}
                    icon={<UserOutlined />}
                    src={avatarUrl || clientSession?.user?.image || user.user_metadata?.avatar_url}
                  />
                  <div style={{ marginTop: 16 }}>
                    <Upload
                      beforeUpload={(file) => {
                        const isImage = file.type.startsWith('image/')
                        if (!isImage) {
                          message.error('You can only upload image files!')
                          return false
                        }
                        const isLt2M = file.size / 1024 / 1024 < 2
                        if (!isLt2M) {
                          message.error('Image must be smaller than 2MB!')
                          return false
                        }
                        handleAvatarUpload(file)
                        return false
                      }}
                      showUploadList={false}
                      accept="image/*"
                    >
                      <Button
                        icon={<UploadOutlined />}
                        loading={uploading}
                        disabled={uploading}
                      >
                        {uploading ? 'Uploading...' : 'Upload Avatar'}
                      </Button>
                    </Upload>
                  </div>
                </div>
                <div>
                  <Text strong style={{ fontSize: 18, display: 'block' }}>
                    {clientSession?.user?.name || user.user_metadata?.full_name || 'User'}
                  </Text>
                  <Text type="secondary">{user.email}</Text>
                </div>
              </Space>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Please enter your email!' },
                      { type: 'email', message: 'Invalid email!' }
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined />}
                      disabled
                      style={{ background: '#f5f5f5' }}
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="full_name"
                    label="Full Name"
                    rules={[{ required: true, message: 'Full name is required!' }]}
                  >
                    <Input
                      prefix={<UserOutlined />}
                      placeholder="Full Name"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="first_name" label="First name">
                    <Input prefix={<UserOutlined />} placeholder="First name" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="last_name" label="Last name">
                    <Input prefix={<UserOutlined />} placeholder="Last name" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="phone"
                    label="Phone"
                    rules={[
                      {
                        pattern: /^[0-9+\-\s()]*$/,
                        message: 'Phone number can only contain numbers, +, -, spaces, and parentheses'
                      }
                    ]}
                  >
                    <Input
                      prefix={<PhoneOutlined />}
                      placeholder="Phone Number"
                      type="tel"
                    />
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="department"
                    label="Department"
                  >
                    <Select placeholder="Select Department" allowClear>
                      {USER_DEPARTMENTS.map((d) => (
                        <Option key={d} value={d}>
                          {d}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="position"
                    label="Position"
                  >
                    <Select placeholder="Select Position" allowClear>
                      {USER_POSITIONS.map((p) => (
                        <Option key={p} value={p}>
                          {p}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>

                <Col xs={24} md={12}>
                  <Form.Item
                    name="timezone"
                    label="Timezone"
                  >
                    <Select
                      placeholder="Select Timezone"
                      showSearch
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      <Option value="UTC">UTC</Option>
                      <Option value="America/New_York">America/New_York (EST)</Option>
                      <Option value="America/Chicago">America/Chicago (CST)</Option>
                      <Option value="America/Denver">America/Denver (MST)</Option>
                      <Option value="America/Los_Angeles">America/Los_Angeles (PST)</Option>
                      <Option value="Europe/London">Europe/London (GMT)</Option>
                      <Option value="Europe/Paris">Europe/Paris (CET)</Option>
                      <Option value="Asia/Tokyo">Asia/Tokyo (JST)</Option>
                      <Option value="Asia/Shanghai">Asia/Shanghai (CST)</Option>
                      <Option value="Asia/Jakarta">Asia/Jakarta (WIB)</Option>
                      <Option value="Australia/Sydney">Australia/Sydney (AEST)</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="locale"
                    label="Language/Locale"
                  >
                    <Select
                      placeholder="Select Language"
                    >
                      <Option value="en">English</Option>
                      <Option value="es">Spanish</Option>
                      <Option value="fr">French</Option>
                      <Option value="de">German</Option>
                      <Option value="ja">Japanese</Option>
                      <Option value="zh">Chinese</Option>
                      <Option value="id">Indonesian</Option>
                      <Option value="pt">Portuguese</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="bio"
                label="Bio"
              >
                <TextArea
                  rows={4}
                  placeholder="Tell us about yourself..."
                  maxLength={500}
                  showCount
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} size="large">
                  Save Changes
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <MyApiKeys />

          <Card style={{ marginTop: 24 }}>
            <Title level={3}>
              <KeyOutlined /> API Tokens for Chrome Extension
            </Title>
            <Text type="secondary">
              Generate API tokens to use with the Chrome Extension. Tokens expire after 30 days.
            </Text>

            {newToken && (
              <Card
                type="inner"
                style={{ marginTop: 16, marginBottom: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}
              >
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Text strong>New Token Generated!</Text>
                  <Text code style={{ fontSize: 12, wordBreak: 'break-all', display: 'block' }}>
                    {newToken}
                  </Text>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => handleCopyToken(newToken)}
                    size="small"
                  >
                    Copy Token
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    ⚠️ Save this token now. You won't be able to see it again!
                  </Text>
                </Space>
              </Card>
            )}

            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleGenerateToken}
                loading={generatingToken}
              >
                Generate New Token
              </Button>
            </div>

            <Divider />

            <div>
              <Text strong>Your Tokens:</Text>
              {loadingTokens ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Text type="secondary">Loading...</Text>
                </div>
              ) : tokens.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                  <Text type="secondary">No tokens yet. Generate one to get started.</Text>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  {tokens.map((token) => (
                    <Card
                      key={token.id}
                      size="small"
                      style={{ marginBottom: 8 }}
                      actions={[
                        <Popconfirm
                          title="Delete this token?"
                          description="This action cannot be undone."
                          onConfirm={() => handleDeleteToken(token.id)}
                          okText="Yes"
                          cancelText="No"
                        >
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                          >
                            Delete
                          </Button>
                        </Popconfirm>,
                      ]}
                    >
                      <Space orientation="vertical" style={{ width: '100%' }}>
                        <div>
                          <Text strong>{token.name}</Text>
                          {token.is_active ? (
                            <Tag color="green" style={{ marginLeft: 8 }}>Active</Tag>
                          ) : (
                            <Tag color="red" style={{ marginLeft: 8 }}>Inactive</Tag>
                          )}
                        </div>
                        <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                          {token.token.substring(0, 20)}...
                        </Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Created: {new Date(token.created_at).toLocaleDateString()}
                            {token.last_used_at && (
                              <> • Last used: {new Date(token.last_used_at).toLocaleDateString()}</>
                            )}
                            {token.expires_at && (
                              <> • Expires: {new Date(token.expires_at).toLocaleDateString()}</>
                            )}
                          </Text>
                        </div>
                      </Space>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </Content>
      </AdminMainColumn>
    </Layout>
  )
}

