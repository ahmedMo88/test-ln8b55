# setup.py
# AI Service Package Configuration
# Version: 1.0.0
# Python >=3.11 required

from setuptools import setup, find_packages

def read_requirements():
    """Read and parse package dependencies from requirements.txt file."""
    requirements = []
    try:
        with open('requirements.txt', 'r') as f:
            for line in f:
                # Skip empty lines and comments
                line = line.strip()
                if line and not line.startswith('#'):
                    requirements.append(line)
    except FileNotFoundError:
        # Fall back to predefined requirements if file not found
        requirements = [
            'fastapi==0.104.0',
            'uvicorn==0.23.2',
            'openai==1.3.0',
            'pinecone-client==2.2.4',
            'tenacity==8.2.3',
            'prometheus-fastapi-instrumentator==6.1.0',
            'python-dotenv==1.0.0',
            'pydantic==2.4.2',
            'httpx==0.25.0',
            'python-jose[cryptography]==3.3.0',
            'numpy==1.24.3',
            'scipy==1.11.3',
            'torch==2.1.0',
            'transformers==4.34.0'
        ]
    return requirements

setup(
    name='ai-service',
    version='1.0.0',
    description='AI service for intelligent workflow automation platform with GPU optimization and vector store integration',
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',
    author='Platform Team',
    author_email='platform@company.com',
    url='https://github.com/company/workflow-automation-platform',
    python_requires='>=3.11',
    package_dir={'': 'src'},
    packages=find_packages(where='src'),
    install_requires=read_requirements(),
    extras_require={
        'dev': [
            'pytest==7.4.3',
            'pytest-asyncio==0.21.1',
            'pytest-cov==4.1.0',
            'black==23.10.0',
            'isort==5.12.0',
            'mypy==1.6.1',
            'flake8==6.1.0'
        ]
    },
    entry_points={
        'console_scripts': [
            'ai-service=ai_service.app:main'
        ]
    },
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'Operating System :: OS Independent',
        'Programming Language :: Python :: 3.11',
        'Topic :: Software Development :: Libraries :: Python Modules',
        'Topic :: Scientific/Engineering :: Artificial Intelligence',
        'Framework :: FastAPI',
        'Environment :: GPU',
        'Intended Audience :: Science/Research',
        'Natural Language :: English',
        'License :: OSI Approved :: MIT License'
    ],
    keywords='ai, machine-learning, workflow-automation, vector-store, gpu-optimization',
    project_urls={
        'Documentation': 'https://docs.company.com/ai-service',
        'Source': 'https://github.com/company/workflow-automation-platform',
        'Issues': 'https://github.com/company/workflow-automation-platform/issues',
    },
    include_package_data=True,
    zip_safe=False,
    platforms='any'
)